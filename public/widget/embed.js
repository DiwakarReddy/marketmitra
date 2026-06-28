/* MarketMitra Booking Widget
 * Drop this on any clinic's website:
 *   <script src="https://app.marketmitra.com/widget/embed.js"
 *           data-business-id="YOUR_BUSINESS_ID"></script>
 *
 * Or render inline:
 *   <div id="marketmitra-widget" data-business-id="YOUR_BUSINESS_ID"></div>
 *   <script src="https://app.marketmitra.com/widget/embed.js"></script>
 */
(function () {
  const script = document.currentScript || document.querySelector('script[data-business-id]')
  const businessId = script?.getAttribute('data-business-id')

  if (!businessId) {
    console.error('[MarketMitra] Missing data-business-id attribute')
    return
  }

  const apiBase = script.src.replace('/widget/embed.js', '/api/widget')

  // Styles injected into shadow DOM
  const styles = `
    :host { all: initial; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Noto Sans', sans-serif; }
    .mm-container { position: fixed; bottom: 20px; right: 20px; z-index: 2147483647; font-family: inherit; }
    .mm-button { background: linear-gradient(135deg, #0f766e, #14b8a6); color: white; border: none; border-radius: 999px; padding: 16px 24px; font-size: 16px; font-weight: 600; cursor: pointer; box-shadow: 0 10px 25px rgba(15, 118, 110, 0.3); display: flex; align-items: center; gap: 8px; transition: transform 0.2s; }
    .mm-button:hover { transform: translateY(-2px); }
    .mm-modal { position: fixed; inset: 0; background: rgba(0,0,0,0.5); display: none; align-items: center; justify-content: center; z-index: 2147483647; padding: 20px; }
    .mm-modal.open { display: flex; }
    .mm-card { background: white; border-radius: 16px; max-width: 480px; width: 100%; max-height: 90vh; overflow-y: auto; box-shadow: 0 25px 50px rgba(0,0,0,0.25); }
    .mm-header { padding: 24px; background: linear-gradient(135deg, #0f766e, #14b8a6); color: white; border-radius: 16px 16px 0 0; }
    .mm-title { font-size: 20px; font-weight: 700; margin: 0 0 4px; }
    .mm-subtitle { font-size: 14px; opacity: 0.9; }
    .mm-body { padding: 24px; }
    .mm-step { display: none; }
    .mm-step.active { display: block; }
    .mm-label { display: block; font-size: 13px; font-weight: 500; color: #475569; margin-bottom: 6px; }
    .mm-input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; box-sizing: border-box; font-family: inherit; }
    .mm-input:focus { outline: none; border-color: #0f766e; box-shadow: 0 0 0 3px rgba(15, 118, 110, 0.1); }
    .mm-services { display: flex; flex-direction: column; gap: 8px; }
    .mm-service { padding: 14px; border: 2px solid #e2e8f0; border-radius: 10px; cursor: pointer; transition: all 0.15s; }
    .mm-service:hover { border-color: #14b8a6; background: #f0fdfa; }
    .mm-service.selected { border-color: #0f766e; background: #f0fdfa; }
    .mm-service-name { font-weight: 600; color: #0f172a; }
    .mm-service-meta { font-size: 12px; color: #64748b; margin-top: 2px; }
    .mm-slots { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
    .mm-slot { padding: 10px; border: 1px solid #cbd5e1; border-radius: 8px; cursor: pointer; text-align: center; font-size: 14px; background: white; transition: all 0.15s; }
    .mm-slot:hover { border-color: #0f766e; background: #f0fdfa; }
    .mm-slot.selected { background: #0f766e; color: white; border-color: #0f766e; }
    .mm-nav { display: flex; justify-content: space-between; gap: 8px; margin-top: 20px; }
    .mm-btn { padding: 12px 20px; border-radius: 8px; font-size: 15px; font-weight: 600; cursor: pointer; border: none; font-family: inherit; }
    .mm-btn-primary { background: #0f766e; color: white; flex: 1; }
    .mm-btn-primary:hover { background: #0d9488; }
    .mm-btn-primary:disabled { opacity: 0.5; cursor: not-allowed; }
    .mm-btn-secondary { background: #f1f5f9; color: #334155; }
    .mm-success { text-align: center; padding: 32px 24px; }
    .mm-success-icon { width: 64px; height: 64px; background: #10b981; border-radius: 50%; margin: 0 auto 16px; display: flex; align-items: center; justify-content: center; color: white; font-size: 32px; }
    .mm-close { position: absolute; top: 12px; right: 12px; background: rgba(255,255,255,0.2); border: none; color: white; width: 32px; height: 32px; border-radius: 50%; cursor: pointer; font-size: 18px; }
    .mm-error { background: #fee2e2; color: #b91c1c; padding: 12px; border-radius: 8px; font-size: 13px; margin-bottom: 16px; }
  `

  const html = `
    <div class="mm-container">
      <button class="mm-button" id="mm-open">📅 Book Appointment</button>
    </div>
    <div class="mm-modal" id="mm-modal">
      <div class="mm-card">
        <div class="mm-header">
          <button class="mm-close" id="mm-close">×</button>
          <h2 class="mm-title" id="mm-title">Book Appointment</h2>
          <div class="mm-subtitle" id="mm-subtitle">Loading...</div>
        </div>
        <div class="mm-body">
          <div id="mm-error" class="mm-error" style="display:none"></div>
          <div class="mm-step active" id="step-service">
            <label class="mm-label">Choose service</label>
            <div class="mm-services" id="mm-services"></div>
            <div class="mm-nav">
              <button class="mm-btn mm-btn-primary" id="next-1" disabled>Next</button>
            </div>
          </div>
          <div class="mm-step" id="step-date">
            <label class="mm-label">Choose date</label>
            <input type="date" class="mm-input" id="mm-date" />
            <div class="mm-nav">
              <button class="mm-btn mm-btn-secondary" data-back="1">Back</button>
              <button class="mm-btn mm-btn-primary" id="next-2" disabled>Next</button>
            </div>
          </div>
          <div class="mm-step" id="step-slot">
            <label class="mm-label">Choose time</label>
            <div class="mm-slots" id="mm-slots"></div>
            <div class="mm-nav">
              <button class="mm-btn mm-btn-secondary" data-back="2">Back</button>
              <button class="mm-btn mm-btn-primary" id="next-3" disabled>Next</button>
            </div>
          </div>
          <div class="mm-step" id="step-details">
            <label class="mm-label">Your name</label>
            <input type="text" class="mm-input" id="mm-name" style="margin-bottom: 12px" />
            <label class="mm-label">Phone (WhatsApp)</label>
            <input type="tel" class="mm-input" id="mm-phone" style="margin-bottom: 12px" />
            <label class="mm-label">Email (optional)</label>
            <input type="email" class="mm-input" id="mm-email" style="margin-bottom: 12px" />
            <div class="mm-nav">
              <button class="mm-btn mm-btn-secondary" data-back="3">Back</button>
              <button class="mm-btn mm-btn-primary" id="next-4">Confirm Booking</button>
            </div>
          </div>
          <div class="mm-step" id="step-success">
            <div class="mm-success">
              <div class="mm-success-icon">✓</div>
              <h3 style="margin: 0 0 8px; color: #0f172a">Booking Confirmed!</h3>
              <p style="color: #64748b; margin: 0" id="mm-confirm-msg">We'll send a WhatsApp reminder.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `

  // Mount via shadow DOM to isolate styles
  const host = document.createElement('div')
  host.id = 'marketmitra-widget-host'
  document.body.appendChild(host)
  const shadow = host.attachShadow({ mode: 'open' })
  const styleEl = document.createElement('style')
  styleEl.textContent = styles
  shadow.appendChild(styleEl)
  const wrap = document.createElement('div')
  wrap.innerHTML = html
  shadow.appendChild(wrap)

  const $ = (id) => shadow.getElementById(id)
  const showError = (msg) => {
    const el = $('mm-error')
    el.textContent = msg
    el.style.display = 'block'
    setTimeout(() => el.style.display = 'none', 5000)
  }

  let state = { business: null, services: [], service: null, date: null, slot: null }

  // Load config
  fetch(`${apiBase}/config?businessId=${businessId}`)
    .then((r) => r.json())
    .then((data) => {
      state.business = data.business
      state.services = data.services
      $('mm-title').textContent = data.business.name
      $('mm-subtitle').textContent = `Book your appointment in ${data.business.city || 'minutes'}`
      const servicesEl = $('mm-services')
      servicesEl.innerHTML = data.services
        .map(
          (s) => `
        <div class="mm-service" data-id="${s.id}">
          <div class="mm-service-name">${s.name}</div>
          <div class="mm-service-meta">${s.durationMin} min · ₹${Math.round(s.price)}</div>
        </div>
      `
        )
        .join('')
      servicesEl.querySelectorAll('.mm-service').forEach((el) => {
        el.addEventListener('click', () => {
          servicesEl.querySelectorAll('.mm-service').forEach((s) => s.classList.remove('selected'))
          el.classList.add('selected')
          state.service = data.services.find((s) => s.id === el.dataset.id)
          $('next-1').disabled = false
        })
      })
    })
    .catch(() => showError('Failed to load. Please refresh.'))

  // Navigation
  const goTo = (step) => {
    shadow.querySelectorAll('.mm-step').forEach((s) => s.classList.remove('active'))
    $(`step-${step}`).classList.add('active')
  }
  $('next-1').addEventListener('click', () => goTo('date'))
  $('next-2').addEventListener('click', async () => {
    state.date = $('mm-date').value
    if (!state.date) return
    goTo('slot')
    $('mm-slots').innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 20px; color: #64748b">Loading slots...</div>'
    try {
      const r = await fetch(`${apiBase}/slots?businessId=${businessId}&serviceId=${state.service.id}&date=${state.date}`)
      const data = await r.json()
      if (data.slots.length === 0) {
        $('mm-slots').innerHTML = '<div style="grid-column: span 3; text-align: center; padding: 20px; color: #64748b">No slots available. Try another date.</div>'
        return
      }
      $('mm-slots').innerHTML = data.slots
        .map(
          (iso) => `
        <div class="mm-slot" data-iso="${iso}">${new Date(iso).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit', hour12: true })}</div>
      `
        )
        .join('')
      $('mm-slots').querySelectorAll('.mm-slot').forEach((el) => {
        el.addEventListener('click', () => {
          $('mm-slots').querySelectorAll('.mm-slot').forEach((s) => s.classList.remove('selected'))
          el.classList.add('selected')
          state.slot = el.dataset.iso
          $('next-3').disabled = false
        })
      })
    } catch {
      showError('Failed to load slots')
    }
  })
  $('next-3').addEventListener('click', () => goTo('details'))
  $('next-4').addEventListener('click', async () => {
    const name = $('mm-name').value.trim()
    const phone = $('mm-phone').value.trim()
    if (!name || !phone) return showError('Name and phone required')

    $('next-4').disabled = true
    try {
      const r = await fetch(`${apiBase}/book`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          businessId,
          serviceId: state.service.id,
          name,
          phone,
          email: $('mm-email').value.trim() || undefined,
          startsAt: state.slot,
        }),
      })
      const data = await r.json()
      if (!r.ok) throw new Error(data.error || 'Booking failed')
      $('mm-confirm-msg').textContent = data.confirmationMessage
      goTo('success')
    } catch (err) {
      showError(err.message)
      $('next-4').disabled = false
    }
  })

  shadow.querySelectorAll('[data-back]').forEach((btn) => {
    btn.addEventListener('click', () => goTo(btn.dataset.back === '1' ? 'service' : btn.dataset.back === '2' ? 'date' : 'slot'))
  })

  // Open / close
  const openModal = () => $('mm-modal').classList.add('open')
  const closeModal = () => $('mm-modal').classList.remove('open')
  $('mm-open').addEventListener('click', openModal)
  $('mm-close').addEventListener('click', closeModal)
  $('mm-modal').addEventListener('click', (e) => {
    if (e.target === $('mm-modal')) closeModal()
  })

  // Set min date to today
  const dateInput = $('mm-date')
  if (dateInput) dateInput.min = new Date().toISOString().split('T')[0]
  dateInput?.addEventListener('change', () => {
    $('next-2').disabled = !dateInput.value
  })
})()