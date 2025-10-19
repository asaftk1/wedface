import React, { useState } from 'react'
const API = import.meta.env.VITE_API_BASE || 'http://localhost:8000'

export default function Register() {
  const [email, setEmail] = useState('')
  const [fullName, setFullName] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState(null)
  const [ok, setOk] = useState(false)

  async function onSubmit(e) {
    e.preventDefault()
    setError(null)
    setOk(false)
    try {
      const r = await fetch(`${API}/api/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, full_name: fullName })
      })
      const j = await r.json()
      if (!r.ok) throw new Error(j.detail || 'register_failed')
      setOk(true)
      // אחרי הרשמה אפשר להפנות ללוגין
      setTimeout(()=> window.location.href = '/login', 600)
    } catch (err) {
      setError(err.message)
    }
  }

  return (
    <div className="p-6 max-w-md mx-auto">
      <h1 className="text-2xl font-bold mb-4">הרשמה</h1>
      <form onSubmit={onSubmit} className="flex flex-col gap-3">
        <input className="input" type="text" placeholder="שם מלא (רשות)" value={fullName} onChange={e=>setFullName(e.target.value)} />
        <input className="input" type="email" placeholder="אימייל" value={email} onChange={e=>setEmail(e.target.value)} />
        <input className="input" type="password" placeholder="סיסמה" value={password} onChange={e=>setPassword(e.target.value)} />
        {error && <div className="text-red-600 text-sm">{String(error)}</div>}
        {ok && <div className="text-green-600 text-sm">נרשמת בהצלחה! מעביר לדף התחברות…</div>}
        <button className="btn" type="submit">הרשם</button>
      </form>
      <div className="text-sm mt-3">
        כבר רשום? <a className="underline" href="/login">להתחברות</a>
      </div>
    </div>
  )
}
