/* Shared authentication gate for the static GitHub Pages apps.
   Uses only the Supabase Publishable key saved in shared-setup.html.
   No service-role/secret key is ever used in the browser. */
(function(){
  'use strict';
  const CONFIG_KEY='koujiSupabaseConfig_v1';
  const css=`
  #kouji-auth-gate{position:fixed;inset:0;z-index:99999;background:#f3f5f8;display:flex;align-items:center;justify-content:center;padding:18px;font-family:system-ui,-apple-system,"Noto Sans JP",sans-serif}
  #kouji-auth-gate .box{width:min(100%,430px);background:#fff;border:1px solid #d8e0e8;border-radius:16px;padding:22px;box-shadow:0 8px 32px #10203018}
  #kouji-auth-gate h2{margin:0 0 8px;font-size:21px;color:#172033}
  #kouji-auth-gate p{font-size:14px;line-height:1.65;color:#526174}
  #kouji-auth-gate label{display:block;margin:12px 0 5px;font-size:13px;font-weight:700;color:#253449}
  #kouji-auth-gate input{width:100%;box-sizing:border-box;padding:12px;border:1px solid #cbd5e1;border-radius:9px;font:inherit}
  #kouji-auth-gate button{border:0;border-radius:9px;padding:12px 15px;background:#1457a6;color:white;font:inherit;font-weight:750;margin:10px 8px 0 0;cursor:pointer}
  #kouji-auth-gate button.secondary{background:#e8eef5;color:#1e3a5f}
  #kouji-auth-gate button:disabled{opacity:.55;cursor:wait}
  #kouji-auth-gate .status{margin-top:12px;padding:11px;border-radius:9px;background:#eef4fb;white-space:pre-wrap;font-size:13px;color:#26384b}
  #kouji-auth-gate .status.error{background:#fff0ef;color:#922b24}
  #kouji-auth-gate .small{font-size:12px;color:#64748b}
  `;
  const style=document.createElement('style');style.textContent=css;document.head.appendChild(style);
  const gate=document.createElement('div');gate.id='kouji-auth-gate';
  gate.innerHTML=`<div class="box"><h2>工事管理アプリ・ログイン</h2><p>登録済みのチームアカウントでログインしてください。パソコンとスマートフォンで同じアカウントを使用できます。</p><div id="kouji-auth-config" class="status">接続設定を確認しています…</div><label for="kouji-auth-email">メールアドレス</label><input id="kouji-auth-email" type="email" autocomplete="username"><label for="kouji-auth-password">パスワード</label><input id="kouji-auth-password" type="password" autocomplete="current-password"><button id="kouji-auth-login">ログイン</button><button id="kouji-auth-logout" class="secondary" type="button">ログアウト</button><p class="small">初回はホームの「共有設定」でProject URLとPublishable keyを保存してください。</p><div id="kouji-auth-status" class="status">認証を確認しています…</div></div>`;
  document.body.appendChild(gate);
  const $=id=>document.getElementById(id), status=(msg,error=false)=>{const el=$('kouji-auth-status');el.textContent=msg;el.classList.toggle('error',error)};
  let client=null, busy=false, resolveCloudReady;
  window.KoujiCloudReady=new Promise(resolve=>{resolveCloudReady=resolve});
  function show(){gate.style.display='flex'}
  function hide(){gate.style.display='none'}
  function getConfig(){try{return JSON.parse(localStorage.getItem(CONFIG_KEY)||'null')}catch(_){return null}}
  async function loadSdk(){
    if(window.supabase?.createClient)return;
    await new Promise((resolve,reject)=>{const s=document.createElement('script');s.src='https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2';s.onload=resolve;s.onerror=()=>reject(new Error('Supabaseライブラリを読み込めません。通信を確認してください。'));document.head.appendChild(s)});
  }
  async function checkMember(user){
    const {data,error}=await client.from('team_members').select('user_id,display_name,role').eq('user_id',user.id).maybeSingle();
    if(error)throw error;
    if(!data)throw new Error('このアカウントは共有メンバーに登録されていません。管理者に登録を依頼してください。');
    return data;
  }
  async function verifySession(){
    const {data,error}=await client.auth.getSession();if(error)throw error;
    if(!data.session)return false;
    const member=await checkMember(data.session.user);
    window.KoujiCloud={client,user:data.session.user,member,revision:{field_data:null,invoice_data:null},ready:true};
    resolveCloudReady(window.KoujiCloud);
    status('ログイン中：'+(member.display_name||data.session.user.email)+'（'+member.role+'）');
    hide();return true;
  }
  async function init(){
    show();
    try{
      const c=getConfig();
      if(!c||!c.url||!c.key){$('kouji-auth-config').textContent='Supabase接続設定がありません。ホーム画面の「共有設定」で設定してください。';status('接続設定が必要です。',true);return}
      $('kouji-auth-config').textContent='接続先：'+c.url;
      await loadSdk();
      client=window.supabase.createClient(c.url,c.key,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
      try{if(await verifySession())return;status('メールアドレスとパスワードでログインしてください。')}catch(e){status('メンバー確認：'+e.message,true)}
    }catch(e){status(e.message||String(e),true)}
  }
  $('kouji-auth-login').onclick=async()=>{
    if(busy||!client){if(!client)status('接続設定を確認できません。共有設定を開いてください。',true);return}
    busy=true;$('kouji-auth-login').disabled=true;
    try{
      const email=$('kouji-auth-email').value.trim(),password=$('kouji-auth-password').value;
      if(!email||!password)throw new Error('メールアドレスとパスワードを入力してください。');
      const {data,error}=await client.auth.signInWithPassword({email,password});if(error)throw error;
      const member=await checkMember(data.user);
      window.KoujiCloud={client,user:data.user,member,revision:{field_data:null,invoice_data:null},ready:true};
      resolveCloudReady(window.KoujiCloud);
      status('ログインしました：'+(member.display_name||data.user.email));hide();
    }catch(e){status('ログインできません：'+e.message,true)}
    finally{busy=false;$('kouji-auth-login').disabled=false}
  };
  $('kouji-auth-logout').onclick=async()=>{
    if(!client)return;
    try{await client.auth.signOut();window.KoujiCloud=null;show();status('ログアウトしました。再度ログインしてください。')}
    catch(e){status('ログアウトに失敗しました：'+e.message,true)}
  };
  window.KoujiCloudAuth={init,show,hide};
  init();
})();