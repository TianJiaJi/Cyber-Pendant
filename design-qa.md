**Source Visual Truth**
- Path: `/Users/aiden/.codex/generated_images/019ecfa8-f5d7-70b3-aa43-78950bcb6180/ig_00fc213d4e9028a4016a3113e236e48199af9f99fef33cc6b5.png`

**Implementation Evidence**
- URL: `http://localhost:5173/#/pages/garment/detail?sn=CP20260615DEMO01`
- Viewport: `390x844`
- State: active demo garment, company card collapsed unless noted
- Query-count screenshot: `/tmp/cyber-pendant-detail-query-count.png`
- Binding smoke screenshot: `/tmp/cyber-pendant-binding-smoke.png`
- First viewport screenshot: `/tmp/cyber-pendant-detail-mobile-visible.png`
- Full page screenshot: `/tmp/cyber-pendant-detail-mobile-full.png`
- Expanded company screenshot: `/tmp/cyber-pendant-detail-mobile-expanded.png`
- Narrow mobile screenshot: `/tmp/cyber-pendant-detail-mobile-320.png`
- Full-view comparison evidence: `/tmp/cyber-pendant-detail-comparison-first-viewport.png`
- Focused/full-page comparison evidence: `/tmp/cyber-pendant-detail-comparison-full.png`

**Findings**
- No actionable P0/P1/P2 findings.
- The implementation preserves the reference hierarchy: custom top bar, quality verification section, assurance card, product title, paper-style tag card with real QR code, production enterprise card, binding card, and support footer.
- The implementation shows a real persisted query count in the assurance card and still omits unsupported first-query time.
- Binding now completes through a real form and public API, then switches the card to the bound state with masked owner display.
- The page is taller than the reference because it renders the real demo garment fields, including grade, wash care, and longer fabric content. This is acceptable for the current scope and avoids hiding true product data.

**Required Fidelity Surfaces**
- Fonts and typography: Chinese text hierarchy, bold section titles, compact metadata, and readable table labels match the reference direction. No text overflow observed at `390px` or `320px`.
- Spacing and layout rhythm: cards, section gaps, dashed row dividers, QR side rail, and footer spacing align with the reference structure. Full-page height differs because of real field density.
- Colors and visual tokens: warm off-white surface, charcoal text, muted gray copy, and green verification seal follow the approved reference while staying consistent with the existing app palette.
- Image quality and asset fidelity: QR code is rendered from the existing real API endpoint. No fake QR placeholder is used.
- Copy and content: active, missing-SN, not-found, company expansion, and bind-toast states use product-specific Chinese copy and avoid unsupported backend claims.
- Binding privacy: the public page shows a masked owner name and phone tail only; raw owner name is not returned in the public garment DTO.

**Patches Made Since Previous QA Pass**
- Rebuilt `client/src/pages/garment/detail.vue` around the approved mobile reference.
- Added real QR rendering through `qrcodeUrl(sn, 'url')`.
- Added company-card expansion and bind-button toast.
- Reworked loading and error states to use the new visual system.
- Added persisted public lookup counting and displayed `当前查询次数 X 次`.
- Added public owner binding with name + phone-tail validation, duplicate-bind protection, and bound-state UI.

**Validation**
- `npm run build:h5` passed.
- `npm test` passed.
- Active route verified at `390x844`; no horizontal overflow.
- Query-count route verified at `390x844`; text matched `当前查询次数 4 次`.
- Binding flow verified at `390x844`; form submitted, page displayed `该校服已绑定主人`, masked name, and phone tail without horizontal overflow.
- Narrow route verified at `320x700`; no horizontal overflow.
- Missing-SN and not-found states verified with the new top bar and state card.
- Company expansion verified; manufacturer address appears and action changes to `收起`.
- Bind button verified; opens form for unbound active tags and becomes `已绑定` after successful binding.

**Follow-up Polish**
- A future backend pass can add real first-query time and binding ownership before those UI elements are shown.
- If exact visual mimicry becomes more important than data completeness, the tag card can gain a dedicated printed-tag asset and tighter row grouping.

final result: passed
