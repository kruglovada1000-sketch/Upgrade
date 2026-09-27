import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { dirname, extname, join, relative, resolve, sep } from 'node:path'

const root = resolve(process.argv[2] || 'site')
const out = resolve(process.argv[3] || 'seo-upload')
const today = '2026-09-27'
if (!existsSync(join(root, 'index.html'))) throw new Error('ohrana.tech checkout not found')
rmSync(out, {recursive:true, force:true}); mkdirSync(out,{recursive:true})
const changed = new Map()
const rel = p => relative(root,p).split(sep).join('/')
function save(p,note,next){ const prev=readFileSync(p,'utf8'); if(prev===next)return; writeFileSync(p,next); const r=rel(p); if(!changed.has(r))changed.set(r,new Set()); changed.get(r).add(note) }
function patch(r,note,fn){ const p=join(root,r); save(p,note,fn(readFileSync(p,'utf8'))) }
function walk(d,a=[]){ for(const n of readdirSync(d)){ if(n==='.git'||n==='node_modules')continue; const p=join(d,n),s=statSync(p); s.isDirectory()?walk(p,a):a.push(p) } return a }

// Собственное название компании: ЧОО. Общие SEO-фразы "ЧОП" не трогаем.
const repl=[
['ООО ЧОП «Рускорпорация охрана и консалтинг»','ООО ЧОО «Рускорпорация охрана и консалтинг»'],
['ООО ЧОП «Рускорпорация»','ООО ЧОО «Рускорпорация»'],
['ЧОП «Рускорпорация охрана и консалтинг»','ЧОО «Рускорпорация охрана и консалтинг»'],
['ЧОП «Рускорпорация»','ЧОО «Рускорпорация»'],
['ЧОП Рускорпорация','ЧОО Рускорпорация']]
for(const p of walk(root)){ const e=extname(p).toLowerCase(); if(!['.html','.xml','.yml','.txt'].includes(e))continue; let t=readFileSync(p,'utf8'),n=t; for(const [a,b] of repl)n=n.split(a).join(b); if(n!==t)save(p,'Единое название компании: ЧОО',n) }

patch('stati/ohrana-uvelirnyh-magazinov.html','Правильный canonical ювелирной статьи',t=>t
 .split('https://ohrana.tech/stati/ohrana-yuvelirnyh-magazinov/').join('https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html')
 .split('https://ohrana.tech/stati/ohrana-yuvelirnyh-magazinov.html').join('https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html'))

// Все внутренние ссылки ведут на одну страницу мероприятий.
for(const p of walk(root)){ const r=rel(p); if(!r.endsWith('.html')||r==='ohrana-meropriyatiy-v-moskve/index.html')continue; let t=readFileSync(p,'utf8'); let n=t
 .split('https://ohrana.tech/ohrana-meropriyatiy-v-moskve/').join('https://ohrana.tech/ohrana-meropriyatiy/')
 .split('href="/ohrana-meropriyatiy-v-moskve/"').join('href="/ohrana-meropriyatiy/"')
 .split("href='/ohrana-meropriyatiy-v-moskve/'").join("href='/ohrana-meropriyatiy/'"); if(n!==t)save(p,'Ссылка мероприятий переведена на canonical',n) }
patch('yandex-services.yml','Яндекс-фид: canonical мероприятий',t=>t.split('https://ohrana.tech/ohrana-meropriyatiy-v-moskve/').join('https://ohrana.tech/ohrana-meropriyatiy/'))

patch('.htaccess','301 дубля мероприятий + удаление старого canonical-костыля',t=>{
 let lines=t.split(/\r?\n/).filter(x=>!x.includes('IS_JEWELRY_ARTICLE')&&!x.includes('Correct canonical signal for the jewelry-security article')&&!x.includes('historically contained a misspelled /yuvelirnyh/ URL'))
 let n=lines.join('\n'), red='Redirect 301 /ohrana-meropriyatiy-v-moskve/ https://ohrana.tech/ohrana-meropriyatiy/'
 if(!n.includes(red)) n += `\n\n# Consolidate duplicate event-security landing page.\n${red}\n`
 return n
})

patch('index.html','Главная: canonical, Open Graph, WebSite и единая entity',t=>{
 let n=t
 const desc='<meta name="description" content="Лицензированное ЧОО в Москве и МО. Физическая и пультовая охрана от 5 000 ₽/мес. ГБР за 10-15 минут. Договор с материальной ответственностью. Выезд специалиста бесплатно. ☎ +7 (925) 047-42-25">'
 if(!n.includes('<link rel="canonical" href="https://ohrana.tech/">')){
   if(!n.includes(desc))throw new Error('homepage description marker not found')
   n=n.replace(desc,`${desc}\n<link rel="canonical" href="https://ohrana.tech/">\n<meta property="og:title" content="Охрана объектов в Москве и Московской области | ЧОО «Рускорпорация»">\n<meta property="og:description" content="Физическая, пультовая и комплексная охрана объектов, бизнеса, мероприятий и частных лиц в Москве и Московской области.">\n<meta property="og:type" content="website">\n<meta property="og:url" content="https://ohrana.tech/">\n<meta property="og:image" content="https://ohrana.tech/images/schit.png">\n<meta property="og:locale" content="ru_RU">\n<meta name="twitter:card" content="summary_large_image">`)
 }
 n=n.split('20 лет в охране · 8 000+ объектов').join('С 2007 года · 8 000+ объектов')
 n=n.split('20 лет опыта').join('С 2007 года')
 n=n.split('Работаем с 2007 года по лицензии.').join('Команда в охране с 2007 года. Действующая лицензия ЧОО — с 2018 года.')
 n=n.replace('"@type": "SecurityService",\n  "name": "ЧОО «Рускорпорация Охрана и Консалтинг»",','"@type": ["Organization", "LocalBusiness"],\n  "@id": "https://ohrana.tech/#organization",\n  "name": "ЧОО «Рускорпорация»",\n  "legalName": "ООО ЧОО «Рускорпорация охрана и консалтинг",')
 if(n.includes('"@id": "https://ohrana.tech/#organization"')&&!n.includes('"identifier": [\n    {"@type":"PropertyValue","name":"ИНН"')){
   n=n.replace('  "email": "fizohrana@ruscor24.ru",','  "email": "fizohrana@ruscor24.ru",\n  "logo": "https://ohrana.tech/images/schit.png",\n  "identifier": [\n    {"@type":"PropertyValue","name":"ИНН","value":"5902050810"},\n    {"@type":"PropertyValue","name":"КПП","value":"590501001"},\n    {"@type":"PropertyValue","name":"ОГРН","value":"1185958064665"},\n    {"@type":"PropertyValue","name":"Лицензия Росгвардии","value":"Л056-00106-59/00033018 от 29.11.2018"}\n  ],')
 }
 if(!n.includes('"@type": "WebSite"')){
   const q=n.indexOf('"@type": "FAQPage"'); if(q<0)throw new Error('FAQ schema not found')
   const s=n.lastIndexOf('<script type="application/ld+json">',q); if(s<0)throw new Error('FAQ script start not found')
   const w='<script type="application/ld+json">\n{\n  "@context": "https://schema.org",\n  "@type": "WebSite",\n  "@id": "https://ohrana.tech/#website",\n  "url": "https://ohrana.tech/",\n  "name": "ЧОО «Рускорпорация»",\n  "publisher": {"@id": "https://ohrana.tech/#organization"},\n  "inLanguage": "ru-RU"\n}\n</script>\n'
   n=n.slice(0,s)+w+n.slice(s)
 }
 return n
})

// Sitemap: убрать дубль и честно обновить lastmod изменённых HTML.
const sm=join(root,'sitemap.xml'); let sitemap=readFileSync(sm,'utf8')
sitemap=sitemap.replace(/\s*<url><loc>https:\/\/ohrana\.tech\/ohrana-meropriyatiy-v-moskve\/<\/loc><lastmod>[^<]*<\/lastmod><\/url>/g,'')
const htmlUrl=r=>r==='index.html'?'https://ohrana.tech/':r.endsWith('/index.html')?`https://ohrana.tech/${r.slice(0,-10)}`:`https://ohrana.tech/${r}`
for(const r of changed.keys())if(r.endsWith('.html')&&r!=='ohrana-meropriyatiy-v-moskve/index.html'){
 const u=htmlUrl(r).replace(/[.*+?^${}()|[\]\\]/g,'\\$&'); sitemap=sitemap.replace(new RegExp(`(<url><loc>${u}<\\/loc><lastmod>)[^<]*(<\\/lastmod><\\/url>)`),`$1${today}$2`)
}
save(sm,'Sitemap: убран дубль и обновлены lastmod',sitemap)

const home=readFileSync(join(root,'index.html'),'utf8'), jew=readFileSync(join(root,'stati/ohrana-uvelirnyh-magazinov.html'),'utf8'), ht=readFileSync(join(root,'.htaccess'),'utf8'), feed=readFileSync(join(root,'yandex-services.yml'),'utf8'), fsmap=readFileSync(sm,'utf8')
const checks=[
[home.includes('<link rel="canonical" href="https://ohrana.tech/">'),'home canonical'],
[home.includes('"@id": "https://ohrana.tech/#organization"'),'organization id'],
[home.includes('"@type": "WebSite"'),'website schema'],
[jew.includes('<link rel="canonical" href="https://ohrana.tech/stati/ohrana-uvelirnyh-magazinov.html">'),'jewelry canonical'],
[!jew.includes('ohrana-yuvelirnyh-magazinov'),'jewelry typo removed'],
[ht.includes('Redirect 301 /ohrana-meropriyatiy-v-moskve/ https://ohrana.tech/ohrana-meropriyatiy/'),'event 301'],
[feed.includes('<url>https://ohrana.tech/ohrana-meropriyatiy/</url>'),'feed canonical'],
[!feed.includes('ohrana-meropriyatiy-v-moskve/'),'feed duplicate removed'],
[!fsmap.includes('ohrana-meropriyatiy-v-moskve/'),'sitemap duplicate removed']]
for(const [ok,name] of checks)if(!ok)throw new Error(`Validation failed: ${name}`)

for(const [r] of changed){ const a=join(root,r),b=join(out,r); mkdirSync(dirname(b),{recursive:true}); cpSync(a,b) }
const list=[...changed.entries()].sort(([a],[b])=>a.localeCompare(b,'ru'))
const txt=['OHRANA.TECH — SEO FIX PACKAGE 2026-09-27','','Загружать с сохранением структуры папок.','.htaccess — в корень сайта.','Старую /ohrana-meropriyatiy-v-moskve/ удалять не нужно: будет 301.','',`Изменено файлов: ${list.length}`,'',...list.flatMap(([r,ns])=>[r,...[...ns].map(x=>`  - ${x}`)]),'','После загрузки проверить главную, редирект мероприятий, ювелирную статью, sitemap.xml и yandex-services.yml.']
writeFileSync(join(out,'UPLOAD-LIST.txt'),txt.join('\n')+'\n')
console.log(`SEO package ready: ${list.length} files`); for(const [r] of list)console.log(r)
