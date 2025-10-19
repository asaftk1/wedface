import React, { useEffect, useState } from 'react'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

function authHeaders() {
  const t = localStorage.getItem('ff_token')
  return t ? { Authorization: `Bearer ${t}` } : {}
}

export default function Dashboard() {
  const [albums, setAlbums] = useState([])
  const [title, setTitle] = useState('')
  const [uploadPct, setUploadPct] = useState({}) // {slug: pct}
  const [prog, setProg] = useState({}) // {slug: percent (index)}

  async function fetchAlbums() {
    const r = await fetch(`${API}/api/my/albums`, { headers: { ...authHeaders() } })
    if (r.status === 401) return (window.location.href = '/login')
    const j = await r.json()
    setAlbums(j || [])
  }

  useEffect(() => { fetchAlbums() }, [])

  async function createAlbum(e) {
    e.preventDefault()
    const r = await fetch(`${API}/api/my/albums`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...authHeaders() },
      body: JSON.stringify({ title, is_public: true })
    })
    const j = await r.json()
    if (!r.ok) return alert(j.detail || 'failed')
    setTitle('')
    setAlbums([j, ...albums])
  }

  function xhrUpload({ url, formData, onProgress }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url, true)
      xhr.upload.onloadstart = () => onProgress?.(1)
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) onProgress(Math.max(1, Math.round((e.loaded / e.total) * 100)))
      }
      xhr.upload.onloadend = () => onProgress?.(100)
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          try { resolve({ status: xhr.status, json: JSON.parse(xhr.responseText || '{}') }) }
          catch (e) { reject(e) }
        }
      }
      xhr.setRequestHeader('Authorization', authHeaders().Authorization || '')
      xhr.send(formData)
    })
  }

  function startIndexPolling(slug) {
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/albums/${slug}/index/progress`)
        const j = await r.json()
        setProg(p => ({ ...p, [slug]: j.percent || 0 }))
        if ((j.percent || 0) >= 100) clearInterval(t)
      } catch {}
    }, 1000)
  }

  async function uploadZip(slug, file) {
    if (!file) return
    const fd = new FormData(); fd.append('zip', file)
    setUploadPct(p => ({ ...p, [slug]: 1 }))
    await xhrUpload({
      url: `${API}/api/my/albums/${slug}/upload`,
      formData: fd,
      onProgress: (pct) => setUploadPct(p => ({ ...p, [slug]: pct }))
    })
    startIndexPolling(slug)
  }

  async function copyShare(slug) {
    const share = `${window.location.origin}/a/${slug}`
    await navigator.clipboard.writeText(share)
    alert('קישור הועתק')
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">דשבורד צלם</h1>

      {/* יצירת אלבום */}
      <form onSubmit={createAlbum} className="card flex gap-3 items-end">
        <div>
          <label className="block text-sm mb-1">שם אלבום</label>
          <input className="input w-80" value={title} onChange={e=>setTitle(e.target.value)} placeholder="למשל: חתונת נטע ועומר" />
        </div>
        <button className="btn" type="submit">צור אלבום</button>
      </form>

      {/* רשימת אלבומים */}
      <div className="card">
        {!albums.length && <div className="text-gray-500">אין אלבומים עדיין</div>}
        <div className="grid gap-4">
          {albums.map(a => (
            <div key={a.slug} className="p-4 border rounded-xl">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <div className="font-semibold">{a.title}</div>
                  <div className="text-sm text-gray-500">slug: {a.slug}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn" onClick={()=>copyShare(a.slug)}>העתק קישור שיתוף</button>
                  <label className="btn cursor-pointer">
                    העלאת ZIP
                    <input type="file" accept=".zip" hidden onChange={(e)=>uploadZip(a.slug, e.target.files?.[0])} />
                  </label>
                </div>
              </div>

              {/* Progress */}
              {(uploadPct[a.slug] > 0 || prog[a.slug] > 0) && (
                <div className="mt-3 space-y-2">
                  {uploadPct[a.slug] > 0 && (
                    <div>
                      <div className="text-sm">העלאה: {uploadPct[a.slug]}%</div>
                      <div className="w-full h-2 bg-gray-200 rounded">
                        <div className="h-2 rounded" style={{width: `${uploadPct[a.slug]}%`, background: 'linear-gradient(90deg,#ffd68a,#f59e0b)'}} />
                      </div>
                    </div>
                  )}
                  {prog[a.slug] > 0 && (
                    <div>
                      <div className="text-sm">אינדוקס: {prog[a.slug]}%</div>
                      <div className="w-full h-2 bg-gray-200 rounded">
                        <div className="h-2 rounded" style={{width: `${prog[a.slug]}%`, background: 'linear-gradient(90deg,#a3a3ff,#6366f1)'}} />
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
