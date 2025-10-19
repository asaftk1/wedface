import React, { useState } from 'react'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function App() {
  const [albumId, setAlbumId] = useState('demo-wedding')
  const [threshold, setThreshold] = useState(0.40)
  const [topk, setTopk] = useState(500)
  const [results, setResults] = useState([])
  const [albumPct, setAlbumPct] = useState(0)      // upload/index progress combined
  const [selfiePct, setSelfiePct] = useState(0)
  const [pollTimer, setPollTimer] = useState(null)

  function authHeaders() {
    const t = localStorage.getItem('ff_token')
    return t ? { Authorization: `Bearer ${t}` } : {}
  }

  function xhrUpload({ url, formData, onProgress, onStart, onDone }) {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest()
      xhr.open('POST', url, true)

      xhr.upload.onloadstart = () => { onStart?.(); onProgress?.(1) }
      xhr.upload.onprogress = (e) => {
        if (e.lengthComputable && onProgress) {
          const pct = Math.max(1, Math.round((e.loaded / e.total) * 100))
          onProgress(pct)
        }
      }
      xhr.upload.onloadend = () => onProgress?.(100)
      xhr.onreadystatechange = () => {
        if (xhr.readyState === 4) {
          onDone?.()
          try { resolve({ status: xhr.status, json: JSON.parse(xhr.responseText || '{}') }) }
          catch (e) { reject(e) }
        }
      }
      xhr.onerror = (e) => { onDone?.(); reject(e) }
      xhr.timeout = 120000
      xhr.send(formData)
    })
  }

  function startIndexPolling() {
    if (pollTimer) clearInterval(pollTimer)
    const t = setInterval(async () => {
      try {
        const r = await fetch(`${API}/api/albums/${albumId}/index/progress`)
        const j = await r.json()
        if (typeof j.percent === 'number') setAlbumPct(p => Math.max(p, j.percent))
        if (j.percent >= 100) {
          clearInterval(t)
          setPollTimer(null)
          setTimeout(() => setAlbumPct(0), 1000)
        } else {
          setPollTimer(t)
        }
      } catch (e) { }
    }, 1000)
  }

  async function uploadAlbumZip(file) {
    if (!file) return alert('בחר קובץ ZIP של האלבום')
    const fd = new FormData(); fd.append('zip', file)
    setAlbumPct(1)
    await xhrUpload({
      url: `${API}/api/albums/${albumId}/album`,
      formData: fd,
      onProgress: setAlbumPct,
    })
    // start indexing progress polling
    startIndexPolling()
  }

  async function uploadSelfies(files) {
    if (!files?.length) return alert('בחר סלפי אחד לפחות')
    const fd = new FormData(); for (const f of files) fd.append('selfies', f)
    setSelfiePct(1)
    const r = await xhrUpload({
      url: `${API}/api/albums/${albumId}/search?threshold=${threshold}&top_k=${topk}`,
      formData: fd,
      onProgress: setSelfiePct,
    })
    setResults(r.json?.results || [])
    setTimeout(() => setSelfiePct(0), 800)
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Album selector */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-2">Album</h2>
        <div className="flex items-center gap-3 flex-wrap">
          <label className="min-w-24">Album ID</label>
          <input className="input w-64" value={albumId} onChange={(e) => setAlbumId(e.target.value)} />
          <div className="text-sm text-gray-500">למשל: demo-wedding</div>
        </div>
      </div>

      {/* Upload album (ZIP) */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-2">העלאת אלבום (ZIP)</h2>
        <input type="file" accept=".zip" onChange={(e) => uploadAlbumZip(e.target.files?.[0])} />
        {albumPct > 0 && (
          <div className="mt-3">
            <div className="w-full h-3 bg-gray-200 rounded-xl overflow-hidden">
              <div className="h-3 rounded-xl" style={{ width: `${albumPct}%`, background: 'linear-gradient(90deg, #ffd68a, #f59e0b)' }} />
            </div>
            <div className="text-sm mt-1">{albumPct}%</div>
          </div>
        )}
      </div>

      {/* Selfie (search) */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-2">העלאת סלפי/ים (חיפוש באלבום)</h2>
        <div className="flex gap-3 items-end flex-wrap mb-3">
          <div className="flex items-center gap-2">
            <label>Threshold</label>
            <input className="input w-24" type="number" step="0.01" value={threshold}
              onChange={e => setThreshold(parseFloat(e.target.value) || 0)} />
          </div>
          <div className="flex items-center gap-2">
            <label>Top K</label>
            <input className="input w-24" type="number" value={topk}
              onChange={e => setTopk(parseInt(e.target.value || '0'))} />
          </div>
        </div>
        <input type="file" accept="image/*" multiple onChange={(e) => uploadSelfies(e.target.files)} />
        {selfiePct > 0 && (
          <div className="mt-3">
            <div className="w-full h-3 bg-gray-200 rounded-xl overflow-hidden">
              <div className="h-3 rounded-xl" style={{ width: `${selfiePct}%`, background: 'linear-gradient(90deg, #a3a3ff, #6366f1)' }} />
            </div>
            <div className="text-sm mt-1">{selfiePct}%</div>
          </div>
        )}
      </div>

      {/* Results */}
      <div className="card">
        <h2 className="text-xl font-semibold mb-2">תוצאות</h2>
        <div className="grid-auto">
          {results.map((r, i) => {
            const imgUrl = `${API}/static/albums/${albumId}/album/${r.rel_path}`
            return (
              <div key={i} className="p-3 border rounded-xl">
                <div className="text-sm mb-1 break-all">{r.rel_path}</div>
                <div className="badge mb-2">score: {r.score?.toFixed?.(3)}</div>
                <div className="w-full overflow-hidden rounded-lg bg-gray-100" style={{ aspectRatio: '1/1' }}>
                  <img
                    src={imgUrl}
                    alt={r.rel_path}
                    style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }}
                    loading="lazy"
                  />
                </div>
              </div>
            )
          })}
          {!results?.length && <div className="text-gray-500">אין תוצאות להצגה</div>}
        </div>
        <a className="btn" href={`${API}/api/albums/${albumId}/download`}>הורד תוצאות (ZIP)</a>

      </div>
    </div>
  )
}
