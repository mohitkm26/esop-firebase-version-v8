import { useState } from 'react'
import { useRouter } from 'next/router'
import { auth, db } from '@/lib/firebase'
import { signInWithPopup, GoogleAuthProvider, signInWithEmailAndPassword, createUserWithEmailAndPassword, sendPasswordResetEmail } from 'firebase/auth'
import Link from 'next/link'
import { findEmployeeEmailByPersonalId } from '@/lib/personal-id-lookup'

export default function Login() {
  const router = useRouter()
  const [mode, setMode] = useState<'signin'|'signup'|'reset'>('signin')
  const [identifier, setIdentifier] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError]     = useState('')
  const [msg, setMsg]         = useState('')
  const [loading, setLoading] = useState(false)

  async function googleLogin() {
    setLoading(true); setError('')
    try {
      await signInWithPopup(auth, new GoogleAuthProvider())
      router.replace('/')
    } catch(e:any) { setError(e.message||'Google sign-in failed') }
    setLoading(false)
  }

  async function emailAuth(e: React.FormEvent) {
    e.preventDefault(); setLoading(true); setError('')
    try {
      const normalizedInput = identifier.trim().toLowerCase()
      const isEmailInput = normalizedInput.includes('@')
      if (mode === 'reset') {
        if (!isEmailInput) {
          setError('Password reset requires an email address.')
          setLoading(false)
          return
        }
        await sendPasswordResetEmail(auth, normalizedInput)
        setMsg('Password reset email sent. Check your inbox.')
        setMode('signin')
      } else if (mode === 'signup') {
        if (!isEmailInput) {
          setError('Signup requires a valid email address.')
          setLoading(false)
          return
        }
        await createUserWithEmailAndPassword(auth, normalizedInput, password)
        router.replace('/')
      } else {
        const signInEmail = isEmailInput
          ? normalizedInput
          : await findEmployeeEmailByPersonalId(db, normalizedInput)

        if (!signInEmail) {
          setError('No employee record found for this Personal ID.')
          setLoading(false)
          return
        }

        await signInWithEmailAndPassword(auth, signInEmail, password)
        router.replace('/')
      }
    } catch(e:any) {
      const codes: Record<string,string> = {
        'auth/user-not-found': 'No account found with this email.',
        'auth/wrong-password': 'Incorrect password.',
        'auth/email-already-in-use': 'This email is already registered.',
        'auth/weak-password': 'Password must be at least 6 characters.',
        'auth/invalid-email': 'Please enter a valid email address.',
        'auth/invalid-credential': 'Invalid email or password.',
      }
      setError(codes[e.code] || e.message || 'Authentication failed.')
    }
    setLoading(false)
  }

  return (
    <div style={{ minHeight:'100vh', display:'flex', background:'var(--bg)' }}>
      {/* Left panel */}
      <div style={{ flex:1, background:'linear-gradient(160deg,#1a1200 0%,#2a1e00 50%,#1a0f00 100%)', padding:'48px', display:'flex', flexDirection:'column', justifyContent:'space-between', minWidth:0 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:64 }}>
            <div style={{ width:34, height:34, borderRadius:9, background:'linear-gradient(135deg,#d4a853,#a07828)', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:900, fontSize:16, color:'#0c0c0c' }}>E</div>
            <span style={{ fontWeight:800, fontSize:17, color:'#f5f0e8' }}>ESOP Manager</span>
          </div>
          <h1 style={{ fontSize:36, fontWeight:900, color:'#f5f0e8', lineHeight:1.2, margin:'0 0 20px' }}>
            Manage your<br/>ESOP program<br/><span style={{ color:'#d4a853' }}>with confidence</span>
          </h1>
          <p style={{ fontSize:15, color:'#a09080', lineHeight:1.7, margin:'0 0 40px', maxWidth:380 }}>
            Join hundreds of Indian startups managing grants, vesting, and compliance on one platform.
          </p>
          <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
            {[
              { icon:'📊', text:'Complete grant lifecycle management' },
              { icon:'📅', text:'Automatic vesting calculations' },
              { icon:'🧮', text:'IndAS 102 ESOP cost reporting' },
              { icon:'🔍', text:'Full audit trail for compliance' },
            ].map(f => (
              <div key={f.text} style={{ display:'flex', alignItems:'center', gap:12 }}>
                <span style={{ fontSize:18 }}>{f.icon}</span>
                <span style={{ fontSize:13.5, color:'#c0b090' }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>
        <div style={{ fontSize:11, color:'#605040' }}>Protected by Firebase Authentication · SOC 2 compliant infrastructure</div>
      </div>

      {/* Right panel */}
      <div style={{ width:460, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', padding:32 }}>
        <div style={{ width:'100%', maxWidth:380 }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:'var(--text)', margin:'0 0 6px' }}>
            {mode==='signin'?'Welcome back':mode==='signup'?'Create account':'Reset password'}
          </h2>
          <p style={{ fontSize:13, color:'var(--text3)', margin:'0 0 28px' }}>
            {mode==='signin'?'Sign in to your ESOP Manager account':mode==='signup'?'Start managing your ESOP program today':'Enter your email to reset your password'}
          </p>

          {error && <div className="alert alert-danger mb-4">{error}</div>}
          {msg   && <div className="alert alert-success mb-4">{msg}</div>}

          {mode !== 'reset' && (
            <>
              <button onClick={googleLogin} disabled={loading} className="btn btn-secondary" style={{ width:'100%', justifyContent:'center', padding:'11px', fontSize:14, marginBottom:20 }}>
                <img src="https://www.google.com/favicon.ico" alt="" style={{ width:16, height:16 }}/>
                Continue with Google
              </button>
              <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:20 }}>
                <div style={{ flex:1, height:1, background:'var(--border)' }}/>
                <span style={{ fontSize:11, color:'var(--text3)', fontWeight:600 }}>OR</span>
                <div style={{ flex:1, height:1, background:'var(--border)' }}/>
              </div>
            </>
          )}

          <form onSubmit={emailAuth} style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <div>
              <label className="label">{mode === 'signin' ? 'Email or Personal ID' : 'Email'}</label>
              <input
                type={mode === 'signin' ? 'text' : 'email'}
                className="input"
                value={identifier}
                onChange={e=>setIdentifier(e.target.value)}
                placeholder={mode === 'signin' ? 'you@company.com or personal ID' : 'you@company.com'}
                required
                autoComplete="email"
              />
            </div>
            {mode !== 'reset' && (
              <div>
                <label className="label">Password</label>
                <input type="password" className="input" value={password} onChange={e=>setPassword(e.target.value)} placeholder="••••••••" required autoComplete={mode==='signup'?'new-password':'current-password'} minLength={6}/>
              </div>
            )}
            <button type="submit" disabled={loading} className="btn btn-primary" style={{ padding:'11px', fontSize:14, justifyContent:'center' }}>
              {loading ? '...' : mode==='signin'?'Sign In':mode==='signup'?'Create Account':'Send Reset Email'}
            </button>
          </form>

          <div style={{ marginTop:20, textAlign:'center', display:'flex', flexDirection:'column', gap:8 }}>
            {mode === 'signin' && (
              <>
                <button onClick={()=>{setMode('signup');setError('');setMsg('')}} style={{ background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontSize:13,fontWeight:600 }}>
                  Don't have an account? Sign up
                </button>
                <button onClick={()=>{setMode('reset');setError('');setMsg('')}} style={{ background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:12 }}>
                  Forgot password?
                </button>
              </>
            )}
            {mode !== 'signin' && (
              <button onClick={()=>{setMode('signin');setError('');setMsg('')}} style={{ background:'none',border:'none',color:'var(--accent)',cursor:'pointer',fontSize:13,fontWeight:600 }}>
                Back to Sign In
              </button>
            )}
          </div>
          <div style={{ marginTop:24, textAlign:'center' }}>
            <Link href="/" style={{ fontSize:12, color:'var(--text3)', textDecoration:'none' }}>← Back to homepage</Link>
          </div>
        </div>
      </div>
    </div>
  )
}
