'use client';
import { useState, type FormEvent } from 'react';
import styles from './AgentWebsite.module.css';

export function ContactForm({ email }: {email: string}) {
  const [name, setName] = useState('');
  const [sender, setSender] = useState('');
  const [phone, setPhone] = useState('');
  const [interest, setInterest] = useState('Buying a home');
  const [message, setMessage] = useState('');
  function compose(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!email) return;
    const subject = encodeURIComponent(`Real estate inquiry: ${interest}`);
    const body = encodeURIComponent(`Name: ${name}\nEmail: ${sender}\nPhone: ${phone || 'Not provided'}\nInterested in: ${interest}\n\nMessage:\n${message}`);
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
  }
  return <form className={styles.contactForm} onSubmit={compose}>
    <h2>Send a message</h2><p>Share a little about what you're looking for.</p>
    <div className={styles.formRow}>
      <label>Your name *<input required maxLength={120} value={name} autoComplete="name" onChange={e=>setName(e.target.value)} placeholder="Your full name"/></label>
      <label>Email address *<input required type="email" maxLength={200} value={sender} autoComplete="email" onChange={e=>setSender(e.target.value)} placeholder="you@example.com"/></label>
    </div>
    <div className={styles.formRow}>
      <label>Phone number<input type="tel" maxLength={50} value={phone} autoComplete="tel" onChange={e=>setPhone(e.target.value)} placeholder="Optional"/></label>
      <label>I'm interested in<select value={interest} onChange={e=>setInterest(e.target.value)}><option>Buying a home</option><option>Selling a home</option><option>Property valuation</option><option>General question</option></select></label>
    </div>
    <label>Message *<textarea required maxLength={4000} rows={5} value={message} onChange={e=>setMessage(e.target.value)} placeholder="Tell me about your goals..." /></label>
    <button type="submit" className={styles.primaryButton} disabled={!email}>Prepare email <span aria-hidden="true">↗</span></button>
    <p className={styles.formNote}>{email ? 'This opens your email app with the details filled in. It does not send automatically or create a CRM lead.' : 'The agent must add a public email address before this form can be used.'}</p>
  </form>;
}
