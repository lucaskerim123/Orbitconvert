'use client';

import { useEffect, useState } from 'react';

export default function Home() {
  const [workspaces, setWorkspaces] = useState([]);
  const [name, setName] = useState('');
  const [error, setError] = useState('');

  async function load() {
    const response = await fetch('/api/workspaces', { cache: 'no-store' });
    const data = await response.json();
    setWorkspaces(data.workspaces || []);
  }

  async function create() {
    setError('');
    const response = await fetch('/api/workspaces', {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name })
    });
    const data = await response.json();
    if (!response.ok) return setError(data.error || 'Unable to create workspace');
    setName('');
    load();
  }

  useEffect(() => { load(); }, []);

  return (
    <main style={{minHeight:'100vh',padding:'48px',boxSizing:'border-box'}}>
      <div style={{maxWidth:1100,margin:'auto'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:40}}>
          <div><h1 style={{fontSize:38,margin:'0 0 8px'}}>OrbitFS</h1><p style={{opacity:.65,margin:0}}>Cloud Workspace</p></div>
          <span style={{padding:'8px 12px',border:'1px solid #29314d',borderRadius:999,fontSize:13}}>Vercel runtime</span>
        </div>
        <section style={{background:'#11182c',border:'1px solid #29314d',borderRadius:16,padding:24}}>
          <h2 style={{marginTop:0}}>Workspaces</h2>
          <div style={{display:'flex',gap:10,marginBottom:22}}>
            <input value={name} onChange={(e)=>setName(e.target.value)} placeholder="Workspace name" onKeyDown={(e)=>e.key==='Enter'&&create()} style={{flex:1,padding:12,borderRadius:8,border:'1px solid #394463',background:'#0b1020',color:'inherit'}} />
            <button onClick={create} style={{padding:'12px 18px',border:0,borderRadius:8,cursor:'pointer'}}>Create</button>
          </div>
          {error && <p style={{color:'#ff9a9a'}}>{error}</p>}
          <div style={{display:'grid',gap:10}}>{workspaces.map((w)=><div key={w.id} style={{padding:16,border:'1px solid #29314d',borderRadius:10,display:'flex',justifyContent:'space-between'}}><div><strong>{w.name}</strong><div style={{opacity:.55,fontSize:13}}>{w.slug}</div></div><span style={{opacity:.65}}>{w.role}</span></div>)}</div>
        </section>
      </div>
    </main>
  );
}
