;; access-gate.clar

(define-constant ERR-INVALID-FORUM-ID u100)
(define-constant ERR-INSUFFICIENT-ENGAGEMENT u101)
(define-constant ERR-UNAUTHORIZED u102)
(define-constant ERR-INVALID-LEVEL u103)
(define-constant ERR-FORUM-ALREADY-EXISTS u104)
(define-constant ERR-FORUM-NOT-FOUND u105)
(define-constant ERR-MAX-FORUMS-EXCEEDED u106)
(define-constant ERR-INVALID-MIN-ENGAGEMENT u107)
(define-constant ERR-INVALID-TIER-INDEX u108)
(define-constant ERR-ACCESS-DENIED u109)
(define-constant ERR-BADGE-NOT-OWNED u110)
(define-constant ERR-LEVEL-MISMATCH u111)
(define-constant ERR-TIMESTAMP-INVALID u112)

(define-data-var next-forum-id uint u0)
(define-data-var max-forums uint u500)
(define-data-var admin principal tx-sender)
(define-data-var default-tiers (list 50 {level: (string-ascii 10), min-engagement: uint}))

(define-map forum-configs ((forum-id uint))
  {name: (string-ascii 50), required-level: (string-ascii 10), created-at: uint, creator: principal, active: bool})

(define-map user-access-logs ((user principal) (forum-id uint))
  {last-access: uint, access-count: uint})

(define-map tier-configs ((string-ascii 10))
  {min-engagement: uint, max-users: uint, description: (string-ascii 100)})

(define-map user-badges ((user principal))
  {current-level: (string-ascii 10), total-engagement: uint, badge-id: uint})

(define-private (validate-forum-id (id uint))
  (if (> id u0) (ok true) (err ERR-INVALID-FORUM-ID)))

(define-private (validate-engagement (eng uint) (min-eng uint))
  (if (>= eng min-eng) (ok true) (err ERR-INSUFFICIENT-ENGAGEMENT)))

(define-private (validate-level (lvl (string-ascii 10)))
  (if (or (is-eq lvl "bronze") (is-eq lvl "silver") (is-eq lvl "gold")) (ok true) (err ERR-INVALID-LEVEL)))

(define-private (validate-min-engagement (min uint))
  (if (and (> min u0) (<= min u10000)) (ok true) (err ERR-INVALID-MIN-ENGAGEMENT)))

(define-private (get-tier-min-engagement (level (string-ascii 10)))
  (match (map-get? tier-configs level)
    t (ok (get min-engagement t))
    (err ERR-INVALID-LEVEL)))

(define-private (is-admin)
  (is-eq tx-sender (var-get admin)))

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)))

(define-public (set-max-forums (new-max uint))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-MIN-ENGAGEMENT))
    (var-set max-forums new-max)
    (ok true)))

(define-public (set-tier-config (level (string-ascii 10)) (min-eng uint) (max-users uint) (desc (string-ascii 100)))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (try! (validate-level level))
    (try! (validate-min-engagement min-eng))
    (asserts! (<= (len desc) u100) (err ERR-INVALID-LEVEL))
    (map-set tier-configs level
      {min-engagement: min-eng, max-users: max-users, description: desc})
    (ok true)))

(define-public (create-forum (name (string-ascii 50)) (req-level (string-ascii 10)))
  (let ((next-id (var-get next-forum-id))
        (current-max (var-get max-forums)))
    (asserts! (< next-id current-max) (err ERR-MAX-FORUMS-EXCEEDED))
    (try! (validate-forum-id next-id))
    (asserts! (is-none (map-get? forum-configs {forum-id: next-id})) (err ERR-FORUM-ALREADY-EXISTS))
    (try! (validate-level req-level))
    (map-set forum-configs {forum-id: next-id}
      {name: name, required-level: req-level, created-at: block-height, creator: tx-sender, active: true})
    (var-set next-forum-id (+ next-id u1))
    (print {event: "forum-created", id: next-id})
    (ok next-id)))

(define-public (deactivate-forum (forum-id uint))
  (let ((forum (map-get? forum-configs {forum-id: forum-id})))
    (match forum
      f (begin
        (asserts! (is-eq (get creator f) tx-sender) (err ERR-UNAUTHORIZED))
        (asserts! (get active f) (err ERR-FORUM-NOT-FOUND))
        (map-set forum-configs {forum-id: forum-id}
          {name: (get name f), required-level: (get required-level f), created-at: (get created-at f),
           creator: (get creator f), active: false})
        (ok true))
      (err ERR-FORUM-NOT-FOUND))))

(define-read-only (get-forum-config (forum-id uint))
  (map-get? forum-configs {forum-id: forum-id}))

(define-public (check-access (forum-id uint) (user principal))
  (let ((forum (map-get? forum-configs {forum-id: forum-id}))
        (user-badge (map-get? user-badges user))
        (req-level (unwrap-panic (map-get? forum-configs {forum-id: forum-id}))))
    (match forum
      f (begin
        (asserts! (get active f) (err ERR-FORUM-NOT-FOUND))
        (try! (validate-level (get required-level f)))
        (match user-badge
          ub (let ((user-eng (get total-engagement ub))
                   (tier-min (unwrap! (get-tier-min-engagement (get current-level ub)) (err ERR-INVALID-LEVEL))))
            (try! (validate-engagement user-eng tier-min))
            (if (is-eq (get current-level ub) (get required-level f))
              (begin
                (map-set user-access-logs {user: user, forum-id: forum-id}
                  {last-access: block-height, access-count: (+ (default-to u0 (get access-count (map-get? user-access-logs {user: user, forum-id: forum-id}))) u1)})
                (ok {access-granted: true, level: (get current-level ub), timestamp: block-height}))
              (err ERR-LEVEL-MISMATCH)))
          (err ERR-BADGE-NOT-OWNED)))
      (err ERR-FORUM-NOT-FOUND))))

(define-public (update-user-badge (user principal) (new-level (string-ascii 10)) (new-eng uint))
  (begin
    (asserts! (is-eq tx-sender user) (err ERR-UNAUTHORIZED))
    (try! (validate-level new-level))
    (let ((current-badge (map-get? user-badges user)))
      (match current-badge
        cb (begin
          (asserts! (>= new-eng (get total-engagement cb)) (err ERR-INSUFFICIENT-ENGAGEMENT))
          (map-set user-badges user
            {current-level: new-level, total-engagement: new-eng, badge-id: (get badge-id cb)})
          (ok true))
        (begin
          (map-set user-badges user
            {current-level: new-level, total-engagement: new-eng, badge-id: block-height})
          (ok true)))))

(define-read-only (get-user-access-log (user principal) (forum-id uint))
  (map-get? user-access-logs {user: user, forum-id: forum-id}))

(define-read-only (get-user-badge (user principal))
  (map-get? user-badges user))

(define-read-only (get-tier-config (level (string-ascii 10)))
  (map-get? tier-configs level))

(define-public (set-default-tiers (tiers (list 50 {level: (string-ascii 10), min-engagement: uint})))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (var-set default-tiers tiers)
    (ok true)))

(define-public (get-forum-count)
  (ok (var-get next-forum-id)))

(define-public (is-forum-active (forum-id uint))
  (match (map-get? forum-configs {forum-id: forum-id})
    f (ok (get active f))
    (ok false))))