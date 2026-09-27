import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const siteRoot = resolve(process.argv[2] || 'site')
const outRoot = resolve(process.argv[3] || 'seo-upload')
const today = '2026-09-27'

if (!existsSync(join(siteRoot, 'index.html'))) {
  throw new Error(`ohrana.tech checkout not found: ${siteRoot}`)
}

rmSync(outRoot, { recursive: true, force: true })
mkdirSync(outRoot, { recursive: true })

const changed = new Map()

function normRel(path) {
  return relative(siteRoot, path).split(sep).join('/')
}

function writeIfChanged(path, next, reason) {
  const prev = readFileSync(path, 'utf8')
  if (prev === next) return false
  writeFileSync(path, next)
  const rel = normRel(path)
  if (!changed.has(rel)) changed.set(rel, new Set())
  changed.get(rel).add(reason)
  return true
}

function patch(rel, transform, reason) {
  const path = join(siteRoot, rel)
  const prev = readFileSync(path, 'utf8')
  const next = transform(prev)
  return writeIfChanged(path, next, reason)
}

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === '.git' || name === 'node_modules') continue
    const path = join(dir, name)
    const st = statSync(path)
    if (st.isDirectory()) walk(path, out)
    else out.push(path)
  }
  return out
}

// 1) Unify only the company's own naming. Generic SEO phrases such as
// "как выбрать ЧОП" are intentionally left untouched.
const ownNameReplacements = [
  ['ООО ЧОП «Рускорпорация охрана и консалтинг»', 'ООО ЧОО «Рускорпорация охрана и консалтинг»'],
  ['ООО ЧОП «Рускорпорация»', 'ООО ЧОО «Рускорпорация»'],
  ['ЧОП «Рускорпорация охрана и консалтинг»', 'ЧОО «Рускорпорация охрана и консалтинг»'],
  ['ЧОП «Рускорпорация»', 'ЧОО «Рускорпорация»'],
  ['ЧОП Рускорпорация', 'ЧОО Рускорпорация'],
]

for (const path of walk(siteRoot)) {
  const rel = normRel(path)
  const ext = extname(path).toLowerCase()
  if (!['.html', '.xml', '.yml', '.txt'].includes(ext)) continue
  let text = readFileSync(path, 'utf8')
  let next = text
  for (const [from, to] of ownNameReplacements) next = next.split(from).join(to)
  if (next !== text) writeIfChanged(path, next, 'Единое название компании: ЧОО вместо ЧОП')
}

// 2) Fix the jewelry article canonical conflict.
patch('stati/ohrana-uvelirnyh-magazinov.html', text =>
  text
    .split('https://ohrana.tech/stati/ohrana-yuvelirnyh-magazinov/').join('https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html')
    .split('https://ohrana.tech/stati/ohrana-yuvelirnyh-magazinov.html').join('https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html'),
  'Исправлен canonical/og:url статьи про ювелирные магазины'
)

// 3) Consolidate the two event-security landing pages on /ohrana-meropriyatiy/.
// Replace internal links, but keep the legacy page itself in place: Apache will 301 it.
for (const path of walk(siteRoot)) {
  const rel = normRel(path)
  if (!rel.endsWith('.html')) continue
  if (rel === 'ohrana-meropriyatiy-v-moskve/index.html') continue
  const text = readFileSync(path, 'utf8')
  const next = text
    .split('https://ohrana.tech/ohrana-meropriyatiy-v-moskve/').join('https://ohrana.tech/ohrana-meropriyatiy/')
    .split('href="/ohrana-meropriyatiy-v-moskve/"').join('href="/ohrana-meropriyatiy/"')
    .split("href='/ohrana-meropriyatiy-v-moskve/'").join("href='/ohrana-meropriyatiy/'")
  if (next !== text) writeIfChanged(path, next, 'Внутренняя ссылка переведена на единую страницу охраны мероприятий')
}

patch('yandex-services.yml', text =>
  text.split('https://ohrana.tech/ohrana-meropriyatiy-v-moskve/').join('https://ohrana.tech/ohrana-meropriyatiy/'),
  'Яндекс-фид переведён на canonical страницы мероприятий'
)

patch('.htaccess', text => {
  let lines = text.split(/\r?\n/)
  lines = lines.filter(line =>
    !line.includes('IS_JEWELRY_ARTICLE') &&
    !line.includes('Correct canonical signal for the jewelry-security article') &&
    !line.includes('historically contained a misspelled /yuvelirnyh/ URL')
  )
  let next = lines.join('\n')
  const redirect = 'Redirect 301 /ohrana-meropriyatiy-v-moskve/ https://ohrana.tech/ohrana-meropriyatiy/'
  if (!next.includes(redirect)) {
    const anchor = 'Redirect 301 /stati/ohrana-meropriyatiy-v-moskve.html https://ohrana.tech/ohrana-meropriyatiy-v-moskve/'
    if (next.includes(anchor)) {
      next = next.replace(anchor, `${anchor}\n${redirect}`)
    } else {
      next += `\n\n# Consolidate duplicate event-security landing page.\n${redirect}\n`
    }
  }
  return next
}, '301 для дубля страницы мероприятий и удаление canonical-костыля ювелирной статьи')

// 4) Strengthen homepage canonical/social/entity signals without changing its design.
patch('index.html', text => {
  let next = text

  if (!next.includes('<link rel="canonical" href="https://ohrana.tech/">')) {
    const desc = '<meta name="description" content="Лицензированное ЧОО в Москве и МО. Физическая и пультовая охрана от 5 000 ₽/мес. ГБР за 10-15 минут. Договор с материальной ответственностью. Выезд специалиста бесплатно. ☎ +7 (925) 047-42-25">'
    const seo = `${desc}\n<link rel="canonical" href="https://ohrana.tech/">\n<meta property="og:title" content="Охрана объектов в Москве и Московской области | ЧОО «Рускорпорация»">\n<meta property="og:description" content="Физическая, пультовая и комплексная охрана объектов, бизнеса, мероприятий и частных лиц в Москве и Московской области.">\n<meta property="og:type" content="website">\n<meta property="og:url" content="https://ohrana.tech/">\n<meta property="og:image" content="https://ohrana.tech/images/schit.png">\n<meta property="og:locale" content="ru_RU">\n<meta name="twitter:card" content="summary_large_image">`
    if (!next.includes(desc)) throw new Error('Homepage description marker not found')
    next = next.replace(desc, seo)
  }

  next = next.split('20 лет в охране · 8 000+ объектов').join('С 2007 года · 8 000+ объектов')
  next = next.split('20 лет опыта').join('С 2007 года')
  next = next.split('Работаем с 2007 года по лицензии.').join('Команда в охране с 2007 года. Действующая лицензия ЧОО — с 2018 года.')

  // Upgrade the existing homepage entity instead of adding a duplicate organization block.
  next = next.replace('"@type": "SecurityService",\n  "name": "ЧОО «Рускорпорация Охрана и Консалтинг»",',
    '"@type": ["Organization", "LocalBusiness"],\n  "@id": "https://ohrana.tech/#organization",\n  "name": "ЧОО «Рускорпорация»",\n  "legalName": "ООО ЧОО «Рускорпорация охрана и консалтинг",')

  if (next.includes('"@id": "https://ohrana.tech/#organization"') && !next.includes('"identifier": [\n    {"@type":"PropertyValue","name":"ИНН"')) {
    next = next.replace('  "email": "fizohrana@ruscor24.ru",',
      '  "email": "fizohrana@ruscor24.ru",\n  "logo": "https://ohrana.tech/images/schit.png",\n  "identifier": [\n    {"@type":"PropertyValue","name":"ИНН","value":"5902050810"},\n    {"@type":"PropertyValue","name":"КПП","value":"590501001"},\n    {"@type":"PropertyValue","name":"ОГРН","value":"1185958064665"},\n    {"@type":"PropertyValue","name":"Лицензия Росгвардии","value":"Л056-00106-59/00033018 от 29.11.2018"}\n  ],')
  }

  if (!next.includes('"@type": "WebSite"')) {
    const marker = '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "FAQPage"'
    const website = '<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "@id": "https://ohrana.tech/#website",\n  "url": "https://ohrana.tech/",\n  "name": "ЧОО «Рускорпорация»",\n  "publisher": {"@id": "https://ohrana.tech/#organization"},\n  "inLanguage": "ru-RU"\n}\n</script>\n'
    if (!next.includes(marker)) throw new Error('Homepage FAQ schema marker not found')
    next = next.replace(marker, website + marker)
  }

  return next
}, 'Главная: HTML canonical, Open Graph, WebSite и единый Organization entity')

// 5) Sitemap: remove the duplicate event URL and update lastmod for every changed HTML page.
const sitemapPath = join(siteRoot, 'sitemap.xml')
let sitemap = readFileSync(sitemapPath, 'utf8')
sitemap = sitemap.replace(/\s*<url><loc>https:\/\/ohrana\.tech\/ohrana-meropriyatiy-v-moskve\/<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g, '')

function urlForHtml(rel) {
  if (rel === 'index.html') return 'https://ohrana.tech/'
  if (rel.endsWith('/index.html')) return `https://ohrana.tech/${rel.slice(0, -'index.html'.length)}`
  return `https://ohrana.tech/${rel}`
}

for (const rel of changed.keys()) {
  if (!rel.endsWith('.html') || rel === 'ohrana-meropriyatiy-v-moskve/index.html') continue
  const url = urlForHtml(rel).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const re = new RegExp(`(<url><loc>${url}<\\/loc><lastmod>)[^<]*(<\\/lastmod><\\/url>)`)
  sitemap = sitemap.replace(re, `$1${today}$2`)
}
writeIfChanged(sitemapPath, sitemap, 'Sitemap: удалён дубль мероприятий и обновлены lastmod изменённых страниц')

// Validate the critical SEO signals.
const home = readFileSync(join(siteRoot, 'index.html'), 'utf8')
const jewelry = readFileSync(join(siteRoot, 'stati/ohrana-uvelirnyh-magazinov.html'), 'utf8')
const htaccess = readFileSync(join(siteRoot, '.htaccess'), 'utf8')
const feed = readFileSync(join(siteRoot, 'yandex-services.yml'), 'utf8')
const finalSitemap = readFileSync(join(siteRoot, 'sitemap.xml'), 'utf8')

const checks = [
  [home.includes('<link rel="canonical" href="https://ohrana.tech/">'), 'homepage HTML canonical'],
  [home.includes('"@id": "https://ohrana.tech/#organization"'), 'homepage organization @id'],
  [home.includes('"@type": "WebSite"'), 'homepage WebSite schema'],
  [jewelry.includes('<link rel="canonical" href="https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html">'), 'jewelry canonical'],
  [!jewelry.includes('ohrana-yuvelirnyh-magazinov'), 'no misspelled jewelry canonical'],
  [htaccess.includes('Redirect 301 /ohrana-meropriyatiy-v-moskve/ https://ohrana.tech/ohrana-meropriyatiy/'), 'event 301'],
  [feed.includes('<url>https://ohrana.tech/ohrana-meropriyatiy/</url>'), 'Yandex feed event URL'],
  [!feed.includes('ohrana-meropriyatiy-v-moskve/'), 'no duplicate event URL in Yandex feed'],
  [!finalSitemap.includes('ohrana-meropriyatiy-v-moskve/'), 'no duplicate event URL in sitemap'],
]
for (const [ok, label] of checks) {
  if (!ok) throw new Error(`Validation failed: ${label}`)
}

// Build an upload-only package preserving the hosting paths.
for (const [rel] of changed) {
  const from = join(siteRoot, rel)
  const to = join(outRoot, rel)
  mkdirSync(dirname(to), { recursive: true })
  cpSync(from, to)
}

const list = [...changed.entries()].sort(([a], [b]) => a.localeCompare(b, 'ru'))
const lines = [
  'OHRANA.TECH — SEO FIX PACKAGE 2026-09-27',
  '',
  'Загружать на хостинг с сохранением этой структуры папок.',
  'Файл .htaccess кладётся в корень сайта.',
  'Старую папку /ohrana-meropriyatiy-v-moskve/ удалять не обязательно: .htaccess отдаст 301 на /ohrana-meropriyatiy/.',
  '',
  `Изменено файлов: ${list.length}`,
  '',
  ...list.flatMap(([rel, reasons]) => [rel, ...[...reasons].map(r => `  - ${r}`)]),
  '',
  'После загрузки:',
  '1. Открыть https://ohrana.tech/ и проверить главную.',
  '2. Проверить, что /ohrana-meropriyatiy-v-moskve/ делает 301 на /ohrana-meropriyatiy/.',
  '3. Проверить https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html.',
  '4. В Яндекс.Вебмастере перепроверить sitemap и yandex-services.yml.',
]
writeFileSync(join(outRoot, 'UPLOAD-LIST.txt'), lines.join('\n') + '\n')

console.log(`SEO package ready: ${list.length} changed files`)
for (const [rel] of list) console.log(rel)
