;; engagement-tracker.clar

(define-constant ERR-INVALID-ACTION-TYPE u200)
(define-constant ERR-INSUFFICIENT-POINTS u201)
(define-constant ERR-UNAUTHORIZED u202)
(define-constant ERR-ACTION-ALREADY-LOGGED u203)
(define-constant ERR-INVALID-TIMESTAMP u204)
(define-constant ERR-MAX-ACTIONS-EXCEEDED u205)
(define-constant ERR-INVALID-POINT-VALUE u206)
(define-constant ERR-USER-NOT-FOUND u207)
(define-constant ERR-CATEGORY-MISMATCH u208)
(define-constant ERR-VERIFICATION-FAILED u209)
(define-constant ERR-DUPLICATE-VERIFICATION u210)
(define-constant ERR-INVALID-CATEGORY u211)
(define-constant ERR-OVERALL-ENGAGEMENT-LIMIT u212)
(define-constant ERR-TIMESTAMP-OUT-OF-ORDER u213)

(define-data-var next-action-id uint u0)
(define-data-var max-actions-per-user uint u100)
(define-data-var admin principal tx-sender)
(define-data-var action-points (list 20 {type: (string-ascii 20), points: uint, category: (string-ascii 20)}))

(define-map user-engagements ((user principal))
  {total-points: uint, action-count: uint, last-update: uint})

(define-map action-logs ((action-id uint))
  {user: principal, action-type: (string-ascii 20), category: (string-ascii 20), points: uint, timestamp: uint, verified: bool})

(define-map user-action-index ((user principal) (action-id uint))
  bool)

(define-map category-configs ((string-ascii 20))
  {max-per-category: uint, description: (string-ascii 100)})

(define-private (validate-action-type (typ (string-ascii 20)))
  (if (or (is-eq typ "vote") (is-eq typ "post") (is-eq typ "proposal") (is-eq typ "comment")) (ok true) (err ERR-INVALID-ACTION-TYPE)))

(define-private (validate-points (pts uint))
  (if (and (> pts u0) (<= pts u1000)) (ok true) (err ERR-INVALID-POINT-VALUE)))

(define-private (validate-category (cat (string-ascii 20)))
  (if (or (is-eq cat "policy") (is-eq cat "discussion") (is-eq cat "voting") (is-eq cat "community")) (ok true) (err ERR-INVALID-CATEGORY)))

(define-private (get-action-points (typ (string-ascii 20)))
  (fold
    (lambda (act res)
      (if (is-eq (get type act) typ)
        (ok (get points act))
        res))
    (var-get action-points)
    (err ERR-INVALID-ACTION-TYPE)))

(define-private (is-admin)
  (is-eq tx-sender (var-get admin)))

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)))

(define-public (set-max-actions-per-user (new-max uint))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-POINT-VALUE))
    (var-set max-actions-per-user new-max)
    (ok true)))

(define-public (set-category-config (cat (string-ascii 20)) (max-per-cat uint) (desc (string-ascii 100)))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (try! (validate-category cat))
    (asserts! (<= (len desc) u100) (err ERR-INVALID-CATEGORY))
    (map-set category-configs cat
      {max-per-category: max-per-cat, description: desc})
    (ok true)))

(define-public (log-engagement (action-type (string-ascii 20)) (category (string-ascii 20)) (custom-points (optional uint)))
  (let ((next-id (var-get next-action-id))
        (user-eng (map-get? user-engagements tx-sender))
        (action-pts (match custom-points cp (ok cp)
                          (get-action-points action-type))))
    (try! (validate-action-type action-type))
    (try! (validate-category category))
    (let ((pts (unwrap! action-pts (err ERR-INVALID-ACTION-TYPE)))
         (current-count (default-to u0 (get action-count user-eng))))
    (asserts! (< current-count (var-get max-actions-per-user)) (err ERR-MAX-ACTIONS-EXCEEDED))
    (asserts! (is-none (map-get? user-action-index {user: tx-sender, action-id: next-id})) (err ERR-ACTION-ALREADY-LOGGED))
    (asserts! (>= block-height (default-to u0 (get last-update user-eng))) (err ERR-TIMESTAMP-OUT-OF-ORDER))
    (map-set action-logs {action-id: next-id}
      {user: tx-sender, action-type: action-type, category: category, points: pts, timestamp: block-height, verified: false})
    (map-set user-action-index {user: tx-sender, action-id: next-id} true)
    (map-set user-engagements tx-sender
      {total-points: (+ (default-to u0 (get total-points user-eng)) pts),
       action-count: (+ current-count u1),
       last-update: block-height})
    (var-set next-action-id (+ next-id u1))
    (print {event: "engagement-logged", id: next-id, points: pts})
    (ok next-id))))

(define-public (verify-action (action-id uint) (verifier principal))
  (let ((action (map-get? action-logs {action-id: action-id})))
    (match action
      a (begin
        (asserts! (not (get verified a)) (err ERR-DUPLICATE-VERIFICATION))
        (asserts! (is-admin) (err ERR-UNAUTHORIZED))
        (map-set action-logs {action-id: action-id}
          {user: (get user a), action-type: (get action-type a), category: (get category a),
           points: (get points a), timestamp: (get timestamp a), verified: true})
        (ok true))
      (err ERR-USER-NOT-FOUND))))

(define-public (update-action-points (action-type (string-ascii 20)) (new-points uint))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (try! (validate-action-type action-type))
    (try! (validate-points new-points))
    (let ((updated-list (fold
      (lambda (act res)
        (if (is-eq (get type act) action-type)
          (unwrap-panic (as-max-len? (+ res u1) u20 {type: action-type, points: new-points, category: (get category act)}))
          (unwrap-panic (as-max-len? (+ res u1) u20 act)))
        res)
      (list) (var-get action-points))))
    (var-set action-points updated-list)
    (ok true))))

(define-read-only (get-user-engagement (user principal))
  (map-get? user-engagements user))

(define-read-only (get-action-log (action-id uint))
  (map-get? action-logs {action-id: action-id}))

(define-read-only (get-category-config (cat (string-ascii 20)))
  (map-get? category-configs cat))

(define-public (reset-user-engagement (target-user principal))
  (begin
    (asserts! (or (is-admin) (is-eq tx-sender target-user)) (err ERR-UNAUTHORIZED))
    (map-set user-engagements target-user
      {total-points: u0, action-count: u0, last-update: u0})
    (ok true)))

(define-public (get-action-count)
  (ok (var-get next-action-id)))

(define-public (is-action-verified (action-id uint))
  (match (map-get? action-logs {action-id: action-id})
    a (ok (get verified a))
    (ok false)))