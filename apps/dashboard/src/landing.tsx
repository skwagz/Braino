import { useEffect, useState } from 'react';
import { ArrowDown, ArrowRight, ArrowUpRight, Check, ChevronDown, Chrome, FileText, Folder, FolderTree, Globe2, Network, ShieldCheck, Sparkles, X } from 'lucide-react';
import { connectDrive, loadConnection } from './connection';
import type { ConnectionStatus } from './connection';
import './landing.css';

export function Landing() {
  const [connection, setConnection] = useState<ConnectionStatus>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => { void loadConnection().then(setConnection).catch(() => {}); }, []);
  const connected = connection?.mode === 'live' && connection.connected;
  async function connect() {
    setBusy(true); setError('');
    try {
      if (connected) window.location.assign('/app');
      else await connectDrive();
    } catch {
      setError('Google Drive connection is not available right now. You can explore the sample workspace, or try connecting again.');
      setBusy(false);
    }
  }
  return <div className="landing">
    <a className="landing-skip" href="#landing-main">Skip to content</a>
    <header className="landing-nav">
      <a href="/" className="landing-brand" aria-label="Braino home"><span><Network size={24} /></span>braino<span className="landing-dot">.</span></a>
      <nav aria-label="Main navigation"><a href="#how-it-works">How it works</a><a href="#your-workspace">Your workspace</a><a href="#questions">FAQs</a></nav>
      <button className="landing-nav-cta" onClick={connect} disabled={busy}>{connected ? 'Open workspace' : 'Connect Drive'}<ArrowUpRight size={16} /></button>
    </header>
    <main id="landing-main" className="landing-main">
      <section className="landing-hero">
        <div className="landing-hero-copy">
          <div className="landing-eyebrow"><span /> A LITTLE STRUCTURE. A LOT MORE CLARITY.</div>
          <h1>Your Drive.<br />A little less chaos.<br /><em>A lot more brain.</em></h1>
          <p>Give scattered docs a place to belong. Braino helps you make sense of your files, review a better structure, and bring it all together.</p>
          <div className="landing-actions"><button className="landing-primary" onClick={connect} disabled={busy}><DriveMark />{busy ? 'Connecting…' : connected ? 'Open your workspace' : 'Connect Google Drive'}<ArrowRight size={17} /></button><a className="landing-secondary" href="/app?demo=1">Explore the demo<ArrowUpRight size={16} /></a></div>
          <div className="landing-trust"><ShieldCheck size={15} /><span>You choose the folder. You review the changes.</span></div>
          {connected && <p className="landing-account">Connected as {connection.email}</p>}
          {error && <div className="landing-error" role="alert"><span>{error}</span><button aria-label="Dismiss connection message" onClick={() => setError('')}><X size={17} /></button></div>}
        </div>
        <div className="landing-illustration" role="img" aria-label="Illustration: scattered project documents become an organized workspace after review">
          <div className="landing-grid" />
          <div className="landing-orbit orbit-one" /><div className="landing-orbit orbit-two" />
          <div className="landing-loose loose-one"><FileText /><span>launch_plan_final_v3</span><small>Somewhere in your Drive</small></div>
          <div className="landing-loose loose-two"><FileText /><span>Meeting notes</span><small>And a few good ideas</small></div>
          <div className="landing-loose loose-three"><Folder /><span>Untitled folder</span><small>You know the one.</small></div>
          <div className="landing-core"><Network size={36} /><span>braino</span></div>
          <div className="landing-output"><div className="landing-output-title"><FolderTree size={19} /><strong>A place for everything</strong><span><Check size={13} /></span></div>
            <div><Folder size={16} /><span>Projects</span><small>Plans & progress</small></div>
            <div><Folder size={16} /><span>Meetings</span><small>Decisions & notes</small></div>
            <div><Folder size={16} /><span>Finance</span><small>Budgets & numbers</small></div>
            <p><Check size={13} /> Ready for your review</p></div>
          <span className="landing-illustration-note">less searching, more doing ↗</span>
        </div>
      </section>
      <div className="landing-platforms"><span>MADE FOR THE WORK YOU ALREADY DO</span><div><DriveMark />Google Drive</div><div><FileText size={18} />Google Docs</div><div><FolderTree size={18} />Google Sheets</div><a href="#how-it-works" aria-label="See how Braino works"><ArrowDown size={18} /></a></div>
      <section id="how-it-works" className="landing-how">
        <div className="landing-section-heading"><div><span className="landing-eyebrow">FROM SCATTERED TO SORTED</span><h2>A fresh start for your files.<br />In three simple steps.</h2></div><p>No new filing system to learn.<br />Start with the Drive you already have.</p></div>
        <div className="landing-steps">
          <article><span className="landing-step-number">01</span><div className="landing-step-icon"><DriveMark /></div><h3>Bring your Drive.</h3><p>Connect your Google account and choose one folder to start with.</p></article>
          <article><span className="landing-step-number">02</span><div className="landing-step-icon"><Sparkles size={25} /></div><h3>Find the connections.</h3><p>Braino reads your Docs and Sheets and suggests where they belong, with evidence from the files.</p></article>
          <article><span className="landing-step-number">03</span><div className="landing-step-icon"><Check size={25} /></div><h3>Make it yours.</h3><p>Review the plan, then apply it. Your original files stay in Drive, in their new places.</p></article>
        </div>
      </section>
      <section id="your-workspace" className="landing-everywhere">
        <div><span className="landing-eyebrow">YOUR WORKSPACE, YOUR WAY</span><h2>A home base on the web.<br />A helping hand in Chrome.</h2><p>Start here to connect your Drive and manage your workspace. We’re bringing Braino closer to your files with a Chrome extension, too.</p></div>
        <div className="landing-surfaces"><a href="/app?demo=1"><Globe2 size={24} /><div><h3>Braino web app</h3><p>See the bigger picture.</p></div><ArrowUpRight size={22} /></a><div><Chrome size={24} /><div><h3>Chrome extension</h3><p>Right where you work.</p></div><span>Coming soon</span></div></div>
      </section>
      <section id="questions" className="landing-faq"><div><span className="landing-eyebrow">GOOD QUESTIONS</span><h2>A little clarity<br />before you connect.</h2></div><div className="landing-answers">
        {[['Will Braino change my files?', 'Connecting and scanning do not move your files. You see a proposed structure first. Applying that plan moves the original files into the proposed folders in Google Drive.'], ['What access does Braino need?', 'The current version requests Drive read and write access so it can organize existing files. That Google permission is broader than your selected folder; Braino uses the folder you choose to scope each run.'], ['Can I try it without connecting?', 'Absolutely. Explore the demo with sample files to try scanning, reviewing, and organizing. The demo does not access or change your Google Drive.'], ['Does it build a knowledge wiki?', 'Source-backed wiki creation is in development. You can explore sample wiki pages in the demo; publishing a wiki into Google Docs is not available yet.']].map(([question, answer]) => <details key={question}><summary>{question}<ChevronDown size={17} /></summary><p>{answer}</p></details>)}
      </div></section>
      <section className="landing-final"><div className="landing-final-icon"><Network size={30} /></div><h2>Make room for your next good idea.</h2><p>Start with one folder. See what falls into place.</p><button className="landing-primary" onClick={connect} disabled={busy}><DriveMark />{busy ? 'Connecting…' : connected ? 'Open your workspace' : 'Connect Google Drive'}<ArrowRight size={17} /></button>{error && <p role="status">Connection unavailable. <a href="/app?demo=1">Explore the demo</a> or try again.</p>}</section>
    </main>
    <footer className="landing-footer"><a className="landing-brand" href="/"><Network size={20} />braino.</a><span>A little structure. A lot more clarity.</span><a href="/app?demo=1">Take a look around<ArrowUpRight size={14} /></a></footer>
  </div>;
}

function DriveMark() {
  return <svg width="20" height="19" viewBox="0 0 24 22" aria-hidden="true"><path d="M8 1h8l8 14h-8z" fill="#e9b94c" /><path d="M8 1 0 15l4 7 8-14z" fill="#47a477" /><path d="M4 22h16l4-7H8z" fill="#5688c7" /></svg>;
}
