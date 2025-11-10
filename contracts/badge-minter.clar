;; badge-minter.clar

(define-constant ERR-INVALID-MINT-TYPE u300)
(define-constant ERR-INSUFFICIENT-ENGAGEMENT u301)
(define-constant ERR-UNAUTHORIZED u302)
(define-constant ERR-MINT-ALREADY-EXISTS u303)
(define-constant ERR-INVALID-TIMESTAMP u304)
(define-constant ERR-MAX-MINTS-EXCEEDED u305)
(define-constant ERR-INVALID-TRAIT u306)
(define-constant ERR-BADGE-NOT-SOULBOUND u307)
(define-constant ERR-METADATA-INVALID u308)
(define-constant ERR-SUPPLY-EXCEEDED u309)
(define-constant ERR-LEVEL-MISMATCH u310)
(define-constant ERR-ROYALTY-SET-FAILED u311)
(define-constant ERR-TRANSFER-NOT-ALLOWED u312)
(define-constant ERR-USER-NOT-REGISTERED u313)
(define-constant ERR-COLLECTION-ALREADY-INIT u314)
(define-constant ERR-INVALID-ROYALTY u315)

(define-data-var next-mint-id uint u0)
(define-data-var max-mints-per-user uint u5)
(define-data-var admin principal tx-sender)
(define-data-var collection-uri (string-ascii 200) "https://civicengage.io/badges/")
(define-data-var royalty-percent uint u500)
(define-data-var soulbound-enforced bool true)

(define-map user-mints ((user principal))
  {mint-count: uint, first-mint: uint, last-upgrade: uint})

(define-map badge-nfts ((token-id uint))
  {owner: principal, level: (string-ascii 10), traits: (list 10 (string-ascii 20)), minted-at: uint, metadata: (string-ascii 200)})

(define-map mint-index ((user principal) (token-id uint))
  bool)

(define-map collection-metadata ((collection-id uint))
  {name: (string-ascii 50), symbol: (string-ascii 10), total-supply: uint})

(define-private (validate-mint-type (typ (string-ascii 10)))
  (if (or (is-eq typ "bronze") (is-eq typ "silver") (is-eq typ "gold")) (ok true) (err ERR-INVALID-MINT-TYPE)))

(define-private (validate-engagement (eng uint) (min-eng uint))
  (if (>= eng min-eng) (ok true) (err ERR-INSUFFICIENT-ENGAGEMENT)))

(define-private (validate-trait (trt (string-ascii 20)))
  (if (and (> (len trt) u0) (<= (len trt) u20)) (ok true) (err ERR-INVALID-TRAIT)))

(define-private (is-admin)
  (is-eq tx-sender (var-get admin)))

(define-public (set-admin (new-admin principal))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (var-set admin new-admin)
    (ok true)))

(define-public (set-max-mints-per-user (new-max uint))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (asserts! (> new-max u0) (err ERR-INVALID-MINT-TYPE))
    (var-set max-mints-per-user new-max)
    (ok true)))

(define-public (set-collection-uri (new-uri (string-ascii 200)))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (asserts! (<= (len new-uri) u200) (err ERR-METADATA-INVALID))
    (var-set collection-uri new-uri)
    (ok true)))

(define-public (set-soulbound-enforced (enforced bool))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (var-set soulbound-enforced enforced)
    (ok true)))

(define-public (init-collection (name (string-ascii 50)) (symbol (string-ascii 10)) (supply uint))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (let ((cid u1))
      (asserts! (is-none (map-get? collection-metadata {collection-id: cid})) (err ERR-COLLECTION-ALREADY-INIT))
      (map-set collection-metadata {collection-id: cid}
        {name: name, symbol: symbol, total-supply: supply})
      (ok cid))))

(define-public (mint-badge (level (string-ascii 10)) (engagement uint) (traits (list 10 (string-ascii 20))) (metadata (string-ascii 200)))
  (let ((next-id (var-get next-mint-id))
        (user-mint (map-get? user-mints tx-sender))
        (min-eng (if (is-eq level "bronze") u10
                   (if (is-eq level "silver") u50 u100)))
        (current-count (default-to u0 (get mint-count user-mint))))
    (try! (validate-mint-type level))
    (try! (validate-engagement engagement min-eng))
    (asserts! (< current-count (var-get max-mints-per-user)) (err ERR-MAX-MINTS-EXCEEDED))
    (asserts! (is-none (map-get? mint-index {user: tx-sender, token-id: next-id})) (err ERR-MINT-ALREADY-EXISTS))
    (map-fold validate-trait traits (ok true))
    (asserts! (<= (len metadata) u200) (err ERR-METADATA-INVALID))
    (let ((nft (contract-call? .sip-009-transferable-v2 mint next-id tx-sender {uri: (var-get collection-uri), name: level})))
      (asserts! (is-ok nft) (err ERR-MINT-ALREADY-EXISTS))
      (map-set badge-nfts {token-id: next-id}
        {owner: tx-sender, level: level, traits: traits, minted-at: block-height, metadata: metadata})
      (map-set mint-index {user: tx-sender, token-id: next-id} true)
      (map-set user-mints tx-sender
        {mint-count: (+ current-count u1),
         first-mint: (if (is-eq current-count u0) next-id (get first-mint user-mint)),
         last-upgrade: block-height})
      (var-set next-mint-id (+ next-id u1))
      (print {event: "badge-minted", id: next-id, level: level})
      (ok next-id))))

(define-public (burn-badge (token-id uint))
  (let ((badge (map-get? badge-nfts {token-id: token-id})))
    (match badge
      b (begin
        (asserts! (is-eq (get owner b) tx-sender) (err ERR-UNAUTHORIZED))
        (asserts! (var-get soulbound-enforced) (err ERR-BADGE-NOT-SOULBOUND))
        (let ((burn-res (contract-call? .sip-009-transferable-v2 burn token-id tx-sender)))
          (asserts! (is-ok burn-res) (err ERR-UNAUTHORIZED))
          (map-delete badge-nfts {token-id: token-id})
          (map-delete mint-index {user: tx-sender, token-id: token-id})
          (ok true))
        )
      (err ERR-USER-NOT-REGISTERED))))

(define-public (set-royalty (token-id uint) (royalty (optional {recipient: principal, percentage: uint})))
  (begin
    (asserts! (is-admin) (err ERR-UNAUTHORIZED))
    (match royalty
      r (let ((set-res (contract-call? .sip-009-transferable-v2 set-royalties token-id r)))
        (asserts! (is-ok set-res) (err ERR-ROYALTY-SET-FAILED))
        (ok true))
      (begin
        (let ((unset-res (contract-call? .sip-009-transferable-v2 unset-royalties token-id)))
          (asserts! (is-ok unset-res) (err ERR-ROYALTY-SET-FAILED))
          (ok true))))))

(define-read-only (get-badge-details (token-id uint))
  (map-get? badge-nfts {token-id: token-id}))

(define-read-only (get-user-mint-info (user principal))
  (map-get? user-mints user))

(define-read-only (get-collection-metadata (collection-id uint))
  (map-get? collection-metadata {collection-id: collection-id}))

(define-public (transfer-badge (token-id uint) (recipient principal))
  (begin
    (asserts! (not (var-get soulbound-enforced)) (err ERR-TRANSFER-NOT-ALLOWED))
    (let ((badge (map-get? badge-nfts {token-id: token-id})))
      (match badge
        b (begin
          (asserts! (is-eq (get owner b) tx-sender) (err ERR-UNAUTHORIZED))
          (let ((transfer-res (contract-call? .sip-009-transferable-v2 transfer token-id tx-sender recipient)))
            (asserts! (is-ok transfer-res) (err ERR-UNAUTHORIZED))
            (map-set badge-nfts {token-id: token-id}
              {owner: recipient, level: (get level b), traits: (get traits b), minted-at: (get minted-at b), metadata: (get metadata b)})
            (ok true)))
        (err ERR-USER-NOT-REGISTERED)))))

(define-public (get-mint-count)
  (ok (var-get next-mint-id)))

(define-public (is-soulbound-enforced)
  (ok (var-get soulbound-enforced)))