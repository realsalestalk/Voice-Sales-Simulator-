/**
 * Lead capture.
 *
 * The form is the product: everything else on the page exists to get someone
 * here. So it validates inline, never blocks on network to give feedback, and
 * degrades to a normal POST if JavaScript fails.
 */

interface SubmitPayload {
  name: string;
  business: string;
  email: string;
  phone: string;
  detail: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function setStatus(el: HTMLElement, message: string, state: 'ok' | 'error' | ''): void {
  el.textContent = message;
  if (state) {
    el.dataset.state = state;
  } else {
    delete el.dataset.state;
  }
}

function markInvalid(input: HTMLInputElement, invalid: boolean): void {
  input.setAttribute('aria-invalid', String(invalid));
}

/**
 * Replace with the real destination per client -- a CRM webhook, a serverless
 * mail handler, whatever that business already uses. Kept as a single seam so
 * a new site only changes this one function.
 */
async function deliver(payload: SubmitPayload): Promise<void> {
  const endpoint = import.meta.env.VITE_LEAD_ENDPOINT;
  if (!endpoint) {
    // No endpoint configured yet (local dev / unconfigured client site).
    console.info('[lead-form] no VITE_LEAD_ENDPOINT set; payload:', payload);
    return;
  }
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!res.ok) throw new Error(`Lead delivery failed: ${res.status}`);
}

export function initLeadForm(): void {
  const form = document.getElementById('lead-form') as HTMLFormElement | null;
  const status = document.getElementById('form-status');
  if (!form || !status) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();

    const data = new FormData(form);

    // Honeypot: a real user never fills a field they cannot see.
    if (String(data.get('company_url') ?? '').trim() !== '') {
      setStatus(status, 'Thanks — we’ll be in touch.', 'ok');
      form.reset();
      return;
    }

    const nameInput = form.elements.namedItem('name') as HTMLInputElement;
    const emailInput = form.elements.namedItem('email') as HTMLInputElement;

    const name = String(data.get('name') ?? '').trim();
    const email = String(data.get('email') ?? '').trim();

    const nameBad = name.length === 0;
    const emailBad = !EMAIL_RE.test(email);

    markInvalid(nameInput, nameBad);
    markInvalid(emailInput, emailBad);

    if (nameBad || emailBad) {
      setStatus(status, 'Add your name and a valid email so we can reply.', 'error');
      (nameBad ? nameInput : emailInput).focus();
      return;
    }

    const payload: SubmitPayload = {
      name,
      business: String(data.get('business') ?? '').trim(),
      email,
      phone: String(data.get('phone') ?? '').trim(),
      detail: String(data.get('detail') ?? '').trim(),
    };

    setStatus(status, 'Sending…', '');

    try {
      await deliver(payload);
      setStatus(status, 'Thanks — we’ll be in touch within one business day.', 'ok');
      form.reset();
      markInvalid(nameInput, false);
      markInvalid(emailInput, false);
    } catch (err) {
      console.error(err);
      setStatus(
        status,
        'Something went wrong. Call (907) 555-0142 and we’ll sort it out.',
        'error',
      );
    }
  });
}
