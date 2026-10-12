import Link from 'next/link';
import {dictionaries,type Locale} from '@/lib/i18n';
import {googleDataPolicy,legalCopy,legalUpdated,supportEmail} from '@/lib/legal';

export function LegalPage({locale,kind}:{locale:Locale;kind:'privacy'|'terms'}){
 const t=dictionaries[locale],copy=legalCopy[locale],doc=copy[kind];
 return <main id="main" className="content-wrap page-wrap legal-page" lang={locale}>
  <span className="eyebrow">NEXTCHINA.ORG / {kind.toUpperCase()}</span>
  <h1 className="page-title">{doc.title}</h1>
  <p className="legal-date">{copy.updated} · <time dateTime={legalUpdated}>{legalUpdated}</time></p>
  <p className="legal-intro">{doc.intro}</p>
  <nav className="legal-navigation" aria-label={t.menu}>
   <Link href={`/${locale}/`}>{t.home}</Link>
   <Link href={`/${locale}/privacy/`}>{legalCopy[locale].privacy.title}</Link>
   <Link href={`/${locale}/terms/`}>{legalCopy[locale].terms.title}</Link>
  </nav>
  <article className="legal-sections">
   {doc.sections.map(section=><section key={section.title}><h2>{section.title}</h2>{section.paragraphs.map(p=><p key={p}>{p}</p>)}</section>)}
  </article>
  {kind==='privacy'&&<div className="legal-references"><a href={googleDataPolicy} target="_blank" rel="noreferrer">{copy.policyLink} ↗</a><a href="https://myaccount.google.com/connections" target="_blank" rel="noreferrer">{copy.revokeLink} ↗</a></div>}
  <section className="legal-contact" id="contact"><h2>{copy.contact}</h2><p>NextChina.org</p><a href={`mailto:${supportEmail}`}>{supportEmail}</a></section>
 </main>;
}
