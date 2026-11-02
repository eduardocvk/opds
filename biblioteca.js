'use strict';
const $ = id => document.getElementById(id);
const api = 'https://api.github.com/repos/eduardocvk/opds/contents/catalog.xml';
const catalogUrl = 'https://eduardocvk.github.io/opds/catalog.xml';
const atom = 'http://www.w3.org/2005/Atom';
const acquire = 'http://opds-spec.org/acquisition';
let githubToken = '', driveToken = '', catalog = null, busy = false, editingId = null;
const selectedIds = new Set();
$('googleClient').value = localStorage.getItem('opds_google_client') || '978947597673-8s75d96r8boafnvjnnpvr7d8am08m6ll.apps.googleusercontent.com';
function notice(text, error = false) { const n = $('notice'); n.textContent = text; n.classList.toggle('error', error); n.hidden = !text; }
function connected() { $('githubButton').classList.toggle('connected', !!githubToken); $('googleButton').classList.toggle('connected', !!driveToken); }
function setBusy(value) { busy = value; $('uploadButton').disabled = value; $('refresh').disabled = value; $('selectAll').disabled = value; $('sort').disabled = value; document.querySelectorAll('.actions button,.book-check,.sort-heading').forEach(b => b.disabled = value); updateSelection(); }
function encode64(value) { const bytes = new TextEncoder().encode(value); let s = ''; for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000)); return btoa(s); }
function decode64(value) { const binary = atob(value.replace(/\s/g, '')); return new TextDecoder().decode(Uint8Array.from(binary, c => c.charCodeAt(0))); }
function parseXml(text) { const doc = new DOMParser().parseFromString(text, 'application/xml'); if (doc.querySelector('parsererror') || doc.documentElement.localName !== 'feed' || doc.documentElement.namespaceURI !== atom) throw Error('El catálogo no tiene un formato válido.'); return doc; }
function entries(doc) { return Array.from(doc.documentElement.children).filter(e => e.namespaceURI === atom && e.localName === 'entry'); }
function child(node, name) { return Array.from(node.children).find(e => e.namespaceURI === atom && e.localName === name); }
function bookData(entry) { const link = Array.from(entry.children).find(e => e.localName === 'link' && e.getAttribute('rel') === acquire); return {id: child(entry, 'id')?.textContent || '', title: child(entry, 'title')?.textContent || 'Sin título', author: child(child(entry,'author') || entry,'name')?.textContent || 'Autor desconocido', date: child(entry,'updated')?.textContent || '', link: link?.getAttribute('href') || ''}; }
async function request(url, options = {}) { const response = await fetch(url, options); if (!response.ok) { let message = ''; try { const data = await response.json(); message = data.error?.message || data.message || ''; } catch (_) {} throw Error(`Error ${response.status}${message ? ': ' + message : ''}`); } return response.status === 204 ? null : response.json(); }
function ghHeaders() { return {Accept:'application/vnd.github+json', ...(githubToken ? {Authorization:`Bearer ${githubToken}`} : {})}; }
async function loadCatalog() { const json = await request(api + '?t=' + Date.now(), {headers:ghHeaders(),cache:'no-store'}); catalog = {sha:json.sha, doc:parseXml(decode64(json.content))}; render(); }
async function writeCatalog(doc, sha, message) {
    if (!githubToken) throw Error('Conecta GitHub antes de modificar el catálogo.');
    const updated = child(doc.documentElement, 'updated'); if (updated) updated.textContent = new Date().toISOString();
    const xml = new XMLSerializer().serializeToString(doc.documentElement);
    const response = await request(api, {method:'PUT',headers:{...ghHeaders(),'Content-Type':'application/json'},body:JSON.stringify({message,sha,content:encode64('<?xml version="1.0" encoding="UTF-8"?>\n' + xml)})});
    catalog = {sha:response.content.sha, doc}; render();
}
function visibleBooks() {
    const query = $('search').value.trim().toLocaleLowerCase('es');
    const [field, direction] = $('sort').value.split('-');
    const collator = new Intl.Collator('es', {sensitivity:'base', numeric:true});
    return entries(catalog.doc).map(bookData).filter(b => (b.title + ' ' + b.author).toLocaleLowerCase('es').includes(query))
        .sort((a,b) => (field === 'date' ? (Date.parse(a.date) || 0) - (Date.parse(b.date) || 0) : collator.compare(a[field], b[field])) * (direction === 'asc' ? 1 : -1) || collator.compare(a.title,b.title));
}
function updateSelection() {
    const n=selectedIds.size; $('selectedCount').textContent = n + (n === 1 ? ' seleccionado' : ' seleccionados');
    $('bulkDelete').disabled=busy || !n; $('bulkAuthor').disabled=busy || !n;
    const visible=catalog ? visibleBooks() : []; const count=visible.filter(b => selectedIds.has(b.id)).length;
    $('selectAll').checked=visible.length > 0 && count===visible.length; $('selectAll').indeterminate=count>0 && count<visible.length;
}
function render() {
    if (!catalog) return;
    const all=entries(catalog.doc).map(bookData), ids=new Set(all.map(b=>b.id));
    for(const id of selectedIds) if(!ids.has(id)) selectedIds.delete(id);
    const filtered=visibleBooks(); $('bookCount').textContent=all.length; $('countPill').textContent=all.length; $('navCount').textContent=all.length;
    const container=$('bookList'); container.replaceChildren();
    if (!filtered.length) { const e=document.createElement('div'); e.className='empty'; e.textContent=$('search').value.trim() ? 'No hay libros que coincidan con tu búsqueda.' : 'No hay libros en el catálogo.'; container.append(e); updateSelection(); return; }
    for (const b of filtered) {
        const row=document.createElement('div'); row.className='book-row';
        const check=document.createElement('input'); check.type='checkbox'; check.className='book-check'; check.checked=selectedIds.has(b.id); check.disabled=busy; check.setAttribute('aria-label','Seleccionar '+b.title); check.onchange=()=>{if(check.checked)selectedIds.add(b.id);else selectedIds.delete(b.id);updateSelection();};
        const name=document.createElement('div');name.className='book-name'; const icon=document.createElement('div');icon.className='book-icon';icon.textContent=b.title.trim().charAt(0).toLocaleUpperCase('es')||'L';
        const text=document.createElement('div'); const title=document.createElement('div');title.className='book-title';title.textContent=b.title;
        const type=document.createElement('div');type.className='book-type';type.textContent='EPUB';text.append(title,type);name.append(icon,text);
        const author=document.createElement('div');author.className='author';author.textContent=b.author;
        const date=document.createElement('div');date.className='date';const d=new Date(b.date);date.textContent=isNaN(d)?'—':new Intl.DateTimeFormat('es-ES',{day:'2-digit',month:'short',year:'numeric'}).format(d);
        const actions=document.createElement('div');actions.className='actions';
        const edit=document.createElement('button');edit.textContent='✎';edit.title='Editar datos del catálogo';edit.setAttribute('aria-label','Editar '+b.title);edit.disabled=busy;edit.onclick=()=>openEdit(b);
        const del=document.createElement('button');del.textContent='×';del.title='Eliminar libro';del.setAttribute('aria-label','Eliminar '+b.title);del.disabled=busy;del.onclick=()=>removeBook(b);
        actions.append(edit,del);row.append(check,name,author,date,actions);container.append(row);
    }
    updateSelection();
}
$('selectAll').onchange=()=>{if(!catalog)return;for(const b of visibleBooks()) {if($('selectAll').checked)selectedIds.add(b.id);else selectedIds.delete(b.id);}render();};
$('sort').onchange=render;
document.querySelectorAll('.sort-heading').forEach(button=>button.onclick=()=>{const field=button.dataset.sort; const current=$('sort').value; $('sort').value=field+'-'+(current===field+'-asc'?'desc':'asc');render();});
function requireGithub() { if (githubToken) return true; notice('Introduce tu token de GitHub para modificar el catálogo.',true); $('credentials').showModal(); return false; }
function requireDrive() { if (driveToken) return true; notice('Conecta Google Drive antes de subir o eliminar archivos.',true); return false; }
$('githubButton').onclick=() => $('credentials').showModal();
$('saveCredentials').onclick = event => { event.preventDefault(); githubToken = $('githubToken').value.trim(); const id = $('googleClient').value.trim(); if (id && !/^[a-zA-Z0-9-]+\.apps\.googleusercontent\.com$/.test(id)) { notice('El ID de cliente de Google no tiene el formato esperado.',true); return; } if(id) localStorage.setItem('opds_google_client',id); else localStorage.removeItem('opds_google_client'); $('credentials').close(); connected(); notice(githubToken ? 'Token de GitHub disponible en esta pestaña.' : 'Introduce el token de GitHub para realizar cambios.'); };
$('googleButton').onclick=() => { const clientId = $('googleClient').value.trim(); if (!clientId) { notice('Introduce primero el ID del cliente web de Google.',true); $('credentials').showModal(); return; } if (!window.google?.accounts?.oauth2) { notice('No se pudo cargar la conexión de Google. Recarga la página.',true); return; } try { google.accounts.oauth2.initTokenClient({client_id:clientId,scope:'https://www.googleapis.com/auth/drive.file',callback:r => { if (r.error) { notice('Google no autorizó el acceso: ' + r.error,true); return; } driveToken=r.access_token; connected(); notice('Google Drive conectado.'); },error_callback:() => notice('No se completó la conexión con Google Drive.',true)}).requestAccessToken({prompt:'consent'}); } catch (e) { notice(e.message,true); } };
$('copyUrl').onclick=async () => { try { await navigator.clipboard.writeText(catalogUrl); notice('Dirección del catálogo copiada.'); } catch (_) { notice('Dirección: ' + catalogUrl); } };
$('search').oninput=render;
$('refresh').onclick=async () => { try { setBusy(true); await loadCatalog(); notice('Biblioteca actualizada.'); } catch(e) { notice('No se pudo cargar el catálogo: ' + e.message,true); } finally {setBusy(false);} };
function openEdit(book) { if (!requireGithub()) return; editingId=book.id; $('editTitle').value=book.title; $('editAuthor').value=book.author; $('editDialog').showModal(); }
$('saveEdit').onclick=async event => { event.preventDefault(); const title=$('editTitle').value.trim(), author=$('editAuthor').value.trim(); if(!title || !author) { notice('Introduce título y autor.',true); return; } $('editDialog').close(); try { setBusy(true); await loadCatalog(); const entry=entries(catalog.doc).find(e => bookData(e).id===editingId); if(!entry) throw Error('El libro ya no está en el catálogo.'); child(entry,'title').textContent=title; const name=child(child(entry,'author'),'name'); if(!name) throw Error('El autor no tiene un formato compatible.'); name.textContent=author; await writeCatalog(catalog.doc,catalog.sha,'Actualizar datos de un libro'); notice('Datos del catálogo actualizados. La página OPDS puede tardar unos minutos en reflejar los cambios.'); } catch(e) {notice('No se pudo actualizar: ' + e.message,true);} finally{setBusy(false);} };
async function driveRequest(path, options = {}) { if (!driveToken) throw Error('Conecta Google Drive.'); return request('https://www.googleapis.com/drive/v3/' + path, {...options,headers:{Authorization:`Bearer ${driveToken}`,...(options.headers||{})}}); }
async function removeOne(book) {
    const id=book.id.startsWith('urn:drive:')?book.id.slice(10):'';
    if(!/^[a-zA-Z0-9_-]+$/.test(id)) throw Error('El libro no tiene un identificador de Drive compatible.');
    let trashed=false;
    try {
        await loadCatalog(); const entry=entries(catalog.doc).find(e=>bookData(e).id===book.id);
        if(!entry) throw Error('El libro ya no está en el catálogo.');
        await driveRequest('files/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:true})}); trashed=true;
        entry.remove();
        try { await writeCatalog(catalog.doc,catalog.sha,'Retirar libro del catálogo'); }
        catch(err) { try { await driveRequest('files/'+id,{method:'PATCH',headers:{'Content-Type':'application/json'},body:JSON.stringify({trashed:false})}); trashed=false; } catch (_) {} throw err; }
        return true;
    } catch(e) {
        if(trashed) throw Error(e.message+' El archivo está en la papelera de Drive; puedes restaurarlo allí.');
        throw e;
    }
}
async function removeBook(book) {
    if (!requireGithub() || !requireDrive()) return;
    if (!confirm('¿Eliminar «'+book.title+'» del catálogo y mover su archivo a la papelera de Google Drive?')) return;
    try { setBusy(true); await removeOne(book); selectedIds.delete(book.id); render(); notice('Libro retirado del catálogo y movido a la papelera de Drive.'); }
    catch(e) { notice('No se pudo completar la eliminación: '+e.message,true); }
    finally {setBusy(false);}
}
$('bulkDelete').onclick=async()=>{
    if(!requireGithub() || !requireDrive() || !catalog) return;
    const books=entries(catalog.doc).map(bookData).filter(b=>selectedIds.has(b.id));
    if(!books.length || !confirm('¿Eliminar '+books.length+' libro(s) del catálogo y mover sus archivos a la papelera de Google Drive?')) return;
    let done=0; const errors=[];
    try {setBusy(true);for(const book of books){ notice('Eliminando '+(done+errors.length+1)+' de '+books.length+': '+book.title); try {await removeOne(book);selectedIds.delete(book.id);done++;} catch(e){errors.push(book.title+': '+e.message);} } render(); notice(done+' libro(s) eliminados.'+(errors.length?' No se pudieron eliminar: '+errors.join(' · '):''),errors.length>0); }
    finally {setBusy(false);}
};
$('bulkAuthor').onclick=()=>{if(!requireGithub()||!selectedIds.size)return;$('bulkAuthorValue').value='';$('bulkAuthorDialog').showModal();};
$('saveBulkAuthor').onclick=async event=>{
    event.preventDefault();const author=$('bulkAuthorValue').value.trim();if(!author){$('bulkAuthorValue').setCustomValidity('Introduce un autor.');$('bulkAuthorValue').reportValidity();$('bulkAuthorValue').setCustomValidity('');return;}
    $('bulkAuthorDialog').close();const ids=new Set(selectedIds);
    try {setBusy(true);await loadCatalog();let changed=0;for(const entry of entries(catalog.doc)){if(!ids.has(bookData(entry).id))continue;const a=child(entry,'author'),name=a&&child(a,'name');if(!name)throw Error('Uno de los libros no tiene un autor compatible.');name.textContent=author;changed++;}if(changed!==ids.size)throw Error('La selección ha cambiado; revisa el catálogo y vuelve a intentarlo.');await writeCatalog(catalog.doc,catalog.sha,'Actualizar autor de varios libros');selectedIds.clear();render();notice('Autor actualizado en '+changed+' libro(s).');}
    catch(e){notice('No se pudo actualizar el autor: '+e.message,true);try{await loadCatalog();}catch(_) {}}finally{setBusy(false);}
};
$('uploadButton').onclick=() => { if (requireGithub() && requireDrive()) $('fileInput').click(); };
$('fileInput').onchange=async event => { const files=Array.from(event.target.files); event.target.value=''; if(!files.length)return; let done=0; try {setBusy(true); await loadCatalog(); const folder=await findFolder(); for(const file of files) { if(!file.name.toLowerCase().endsWith('.epub')) throw Error('Solo se admiten archivos EPUB.'); notice(`Subiendo ${done+1} de ${files.length}: ${file.name}`); const metadata=await epubMetadata(file); const uploaded=await uploadFile(file,folder); try { await driveRequest(`files/${uploaded.id}/permissions`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({type:'anyone',role:'reader',allowFileDiscovery:false})}); const data=await driveRequest(`files/${uploaded.id}?fields=webContentLink`); if(!data.webContentLink) throw Error('Drive no proporcionó un enlace de descarga.'); await loadCatalog(); appendEntry(catalog.doc,{id:'urn:drive:'+uploaded.id,title:metadata.title,author:metadata.author,date:new Date().toISOString(),link:data.webContentLink,size:file.size}); await writeCatalog(catalog.doc,catalog.sha,'Añadir libro al catálogo OPDS'); done++; } catch(e) { throw Error(`El archivo «${file.name}» se subió a Drive (ID ${uploaded.id}) pero no se publicó en el catálogo: ${e.message}`); } } notice(`${done} libro(s) publicados. GitHub Pages puede tardar unos minutos en actualizarse.`); } catch(e) {notice(`${done} libro(s) publicados. ${e.message}`,true);} finally {setBusy(false);} };
async function findFolder() { const q="name = 'Biblioteca OPDS' and mimeType = 'application/vnd.google-apps.folder' and trashed = false"; const data=await driveRequest('files?'+new URLSearchParams({q,fields:'files(id,name)',pageSize:'100'})); if(data.files?.length) return data.files[0].id; const folder=await driveRequest('files?fields=id',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({name:'Biblioteca OPDS',mimeType:'application/vnd.google-apps.folder'})}); return folder.id; }
async function uploadFile(file, folder) { const boundary='opds_'+crypto.randomUUID().replaceAll('-',''); const meta=JSON.stringify({name:file.name,mimeType:'application/epub+zip',parents:[folder]}); const body=new Blob([`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: application/epub+zip\r\n\r\n`,file,`\r\n--${boundary}--\r\n`]); return request('https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id',{method:'POST',headers:{Authorization:`Bearer ${driveToken}`,'Content-Type':`multipart/related; boundary=${boundary}`},body}); }
function appendEntry(doc,b) { const e=doc.createElementNS(atom,'entry'); function add(parent,name,value) {const node=doc.createElementNS(atom,name);node.textContent=value;parent.appendChild(node);return node;} add(e,'id',b.id);add(e,'title',b.title);add(e,'updated',b.date);add(add(e,'author',''),'name',b.author); const link=doc.createElementNS(atom,'link'); link.setAttribute('rel',acquire);link.setAttribute('type','application/epub+zip');link.setAttribute('href',b.link);link.setAttribute('length',b.size);e.appendChild(link);doc.documentElement.appendChild(e); }
// Leer los metadatos OPF directamente del ZIP, sin enviar el EPUB a otros servicios.
async function epubMetadata(file) { const fallback={title:file.name.replace(/\.epub$/i,'').replace(/[_-]/g,' '),author:'Desconocido'}; try {const bytes=new Uint8Array(await file.arrayBuffer()), view=new DataView(bytes.buffer); let end=-1; for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--) if(view.getUint32(i,true)===0x06054b50){end=i;break;} if(end<0) return fallback; let offset=view.getUint32(end+16,true); const count=view.getUint16(end+10,true), map=new Map(); for(let n=0;n<count;n++) {if(view.getUint32(offset,true)!==0x02014b50)break; const method=view.getUint16(offset+10,true),size=view.getUint32(offset+20,true), nameLength=view.getUint16(offset+28,true),extra=view.getUint16(offset+30,true),comment=view.getUint16(offset+32,true),local=view.getUint32(offset+42,true),name=new TextDecoder().decode(bytes.subarray(offset+46,offset+46+nameLength));map.set(name,{method,size,local});offset+=46+nameLength+extra+comment;} async function read(name){const z=map.get(name);if(!z)throw Error('Entrada no encontrada');const start=z.local+30+view.getUint16(z.local+26,true)+view.getUint16(z.local+28,true);const raw=bytes.slice(start,start+z.size);if(z.method===0)return new TextDecoder().decode(raw);if(z.method!==8||!window.DecompressionStream)throw Error('Compresión no disponible');const stream=new Blob([raw]).stream().pipeThrough(new DecompressionStream('deflate-raw'));return new Response(stream).text();} const c=new DOMParser().parseFromString(await read('META-INF/container.xml'),'application/xml'); const root=Array.from(c.getElementsByTagName('*')).find(x=>x.localName==='rootfile'); const path=root?.getAttribute('full-path');if(!path)return fallback; const opf=new DOMParser().parseFromString(await read(path),'application/xml');const title=opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/','title')[0]?.textContent?.trim(),author=opf.getElementsByTagNameNS('http://purl.org/dc/elements/1.1/','creator')[0]?.textContent?.trim();return {title:title||fallback.title,author:author||fallback.author};} catch(_){return fallback;} }
loadCatalog().catch(e => { $('bookList').textContent='No se pudo cargar el catálogo.';notice('No se pudo cargar el catálogo: '+e.message,true); });

