'use client';

import { useRef, useState, type FormEvent } from 'react';
import styles from './AgentWebsite.module.css';

type Status = 'idle' | 'sending' | 'success' | 'error';

/** A public contact form, NOT a logged-in CRM editor.
 *  The server maps the published site slug to the owning agent's user_id.
 *  Never accept a user_id or brokerage_id from website visitors.
 */
export function ContactForm({ siteSlug, preview = false }: { siteSlug: string; preview?: boolean }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState('Buying a home');
  const [message, setMessage] = useState('');
  const [website, setWebsite] = useState(''); // Invisible honeypot for basic spam deterrence.
  const [status, setStatus] = useState<Status>('idle');
  const [feedback, setFeedback] = useState('');
  const requestId = useRef<string | null>(null);
  const busy = status === 'sending';

  async function submit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (preview || busy) return;
    setStatus('sending');
    setFeedback('');
    try {
      if (!requestId.current) requestId.current = crypto.randomUUID();
      const response = await fetch('/api/agent-site/inquiry', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          slug: siteSlug, request_id: requestId.current,
          name: name.trim(), email: email.trim(), phone: phone.trim(),
          interest, message: message.trim(), website,
        }),
      });
      const result: { ok?: boolean; error?: string } = await response.json().catch(() => ({}));
      if (!response.ok || !result.ok) throw new Error(result.error || 'Unable to send your message. Please try again.');
      setStatus('success');
      setFeedback('Thank you! Your inquiry was saved for the agent to review.');
      setName(''); setEmail(''); setPhone(''); setMessage(''); setInterest('Buying a home');
      requestId.current = null;
    } catch (err) {
      setStatus('error');
      setFeedback(err instanceof Error ? err.message : 'Unable to send your message. Please try again.');
      // Keep the same request ID on retry so the server cannot create a duplicate note.
    }
  }

  return <form className={styles.contactForm} onSubmit={submit}>
    <h2>Send a message</h2>
    <p>Share a little about what you're looking for. Your inquiry goes to this agent directly.</p>
    <div className={styles.formRow}>
      <label>Your name *
        <input required maxLength={120} value={name} autoComplete="name" onChange={e => setName(e.target.value)} placeholder="Your full name" disabled={busy} />
      </label>
      <label>Email address *
        <input required type="email" maxLength={200} value={email} autoComplete="email" onChange={e => setEmail(e.target.value)} placeholder="you@example.com" disabled={busy} />
      </label>
    </div>
    <div className={styles.formRow}>
      <label>Phone number
        <input type="tel" maxLength={50} value={phone} autoComplete="tel" onChange={e => setPhone(e.target.value)} placeholder="Optional" disabled={busy} />
      </label>
      <label>I'm interested in
        <select value={interest} onChange={e => setInterest(e.target.value)} disabled={busy}>
          <option>Buying a home</option><option>Selling a home</option>
          <option>Property valuation</option><option>General question</option>
        </select>
      </label>
    </div>
    <label>Message *
      <textarea required maxLength={4000} rows={5} value={message} onChange={e => setMessage(e.target.value)} placeholder="Tell me about your goals..." disabled={busy} />
    </label>
    <div className={styles.honeypot} aria-hidden="true">
      <label>Website<input type="text" tabIndex={-1} autoComplete="off" value={website} onChange={e => setWebsite(e.target.value)} /></label>
    </div>
    <button type="submit" className={styles.primaryButton} disabled={preview || busy || !siteSlug}>
      {busy ? 'Sending…' : preview ? 'Publish to activate contact form' : 'Send message'}
      <span aria-hidden="true">↗</span>
    </button>
    {feedback && <p className={status === 'success' ? styles.formSuccess : styles.formError} role={status === 'error' ? 'alert' : 'status'} aria-live="polite">{feedback}</p>}
    <p className={styles.formNote}>
      {preview
        ? 'Preview only. Once your website is published, this form saves inquiries to your RealVolt CRM.'
        : 'Your inquiry is saved in this agent’s CRM so they can respond. This form does not sign you up for automated marketing.'}
    </p>
  </form>;
}
