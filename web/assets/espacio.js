// Cielo de kywai: estrellas de colores y la Tierra, dibujados con WebGL2 detrás de toda la página.
// Texturas de la Tierra: Solar System Scope (solarsystemscope.com/textures), licencia CC BY 4.0, a partir de imágenes de la NASA. Ver assets/espacio/CREDITOS.txt.
(function(){
var VS='#version 300 es\nvoid main(){vec2 p=vec2((gl_VertexID<<1)&2,gl_VertexID&2);gl_Position=vec4(p*2.-1.,0.,1.);}';
var FS='#version 300 es\nprecision highp float;uniform vec2 uRes;uniform float uT;uniform vec4 uX;uniform vec4 uV;uniform sampler2D uD,uM;uniform float uRot,uLd,uLt;out vec4 o;\n'+
'float h21(vec2 p){p=fract(p*vec2(123.34,456.21));p+=dot(p,p+45.32);return fract(p.x*p.y);}\n'+
'float nz(vec2 p){vec2 i=floor(p),f=fract(p);f=f*f*(3.-2.*f);return mix(mix(h21(i),h21(i+vec2(1,0)),f.x),mix(h21(i+vec2(0,1)),h21(i+vec2(1,1)),f.x),f.y);}\n'+
'float fbm(vec2 p){float a=.5,s=0.;for(int i=0;i<5;i++){s+=a*nz(p);p=p*2.03+17.;a*=.5;}return s;}\n'+[
'vec3 stars(vec2 uv,float sc,float seed,float t){vec2 g=uv*sc;vec2 id=floor(g);vec2 f=fract(g)-.5;float r=h21(id+seed);',
' vec2 off=(vec2(h21(id+seed+3.1),h21(id+seed+7.7))-.5)*.6;float d=length(f-off);',
' float on=step(uV.x,r);float core=smoothstep(.05*(.4+r),0.,d);float glow=exp(-d*d*(150.-90.*r))*.75;',
' float tw=.42+.58*pow(.5+.5*sin(t*(.5+2.6*h21(id+seed+21.))+6.2832*h21(id+seed+29.)),1.6);float h=h21(id+seed+13.);',
' vec3 kc=h<.38?vec3(.25,.55,1.):h<.7?vec3(.1,.9,.55):vec3(1.,.5,.15);',
' return (mix(vec3(1.),kc,uV.z)*core*1.3+mix(vec3(.75,.88,1.),kc,uV.z+.2)*glow)*on*tw*uV.y;}',
'float bigstar(vec2 q,float t){float d=length(q);float tw=(.52+.48*pow(.5+.5*sin(t*.75+sin(t*.27)*1.6),1.3))*(.93+.07*sin(t*2.3+sin(t*.9)*2.));float sk=1.+(1.-tw)*1.6;float core=smoothstep(.016*(.75+.25*tw),0.,d)*2.2+exp(-d*d*5200.)*1.4;float glow=exp(-d*(26.+8.*(1.-tw)))*.5+exp(-d*7.)*.06;float sp=(exp(-abs(q.y)*260.)*exp(-abs(q.x)*21.*sk)+exp(-abs(q.x)*260.)*exp(-abs(q.y)*21.*sk))*.75;float sp2=(exp(-abs(q.x+q.y)*300.)*exp(-abs(q.x-q.y)*40.)+exp(-abs(q.x-q.y)*300.)*exp(-abs(q.x+q.y)*40.))*.22;return (core+glow+sp+sp2)*tw;}',
'vec3 meteor(vec2 uv,float asp,float per,float seed,float t){float k=floor(t/per);float lt=t-k*per;float r1=h21(vec2(k,seed)),r2=h21(vec2(k+7.3,seed+1.7)),r3=h21(vec2(k+3.1,seed+5.9)),r4=h21(vec2(k+11.7,seed+9.3));if(r1<.58)return vec3(0.);float dur=1.5+.8*r3;float u=lt/dur;if(u>1.45)return vec3(0.);float ang=.3+.42*r2;vec2 dir=vec2(-cos(ang),-sin(ang));vec2 nrm=vec2(-dir.y,dir.x);vec2 st=vec2(asp*(.15+1.05*r4)+.35,.45+.8*r3);float L=1.8;float uu=min(u,1.);float ue=uu*(1.12-.12*uu);vec2 hd=st+dir*L*ue;vec2 pa=uv-hd;float al=dot(pa,-dir);float pp=dot(pa,nrm);float ln=.5+.22*r2;float t01=clamp(al/ln,0.,1.);float fd=smoothstep(0.,.07,uu)*(1.-smoothstep(.78,1.,uu))*step(u,1.);float ah=smoothstep(-.006,.012,al);float w=.0029*(1.-.7*t01);float core=exp(-pp*pp/(2.*w*w))*pow(max(1.-t01,.0001),1.5)*ah;float halo=exp(-pp*pp/(2.*w*w*30.))*pow(max(1.-t01,.0001),2.)*ah*.4;float rd=length(pa);float head=exp(-rd*rd/(2.*.0034*.0034))*3.+exp(-rd*20.)*.55+exp(-rd*70.)*.6;float fl=(exp(-abs(pa.x)*300.)*exp(-abs(pa.y)*50.)+exp(-abs(pa.y)*300.)*exp(-abs(pa.x)*50.))*.5;vec3 tc=mix(vec3(1.,.96,.88),vec3(.35,.7,1.),smoothstep(0.,.55,t01));tc=mix(tc,vec3(.2,.85,.6),smoothstep(.55,1.,t01)*.45);vec3 c=(tc*core*1.7+vec3(.3,.6,1.)*halo+vec3(1.,.97,.9)*(head+fl))*fd;for(int i=0;i<6;i++){float fi=float(i);float h1=h21(vec2(k+fi*3.7,seed+fi)),h2=h21(vec2(k+fi*5.1,seed+fi*2.3));float ui=.12+.7*h1;if(u>ui){vec2 pos=st+dir*L*(ui*(1.12-.12*ui))+nrm*(h2-.5)*.03;float dd=length(uv-pos);float life=exp(-(u-ui)*4.5);float tw=.6+.4*sin(t*14.+fi*9.);c+=mix(vec3(.6,.85,1.),vec3(1.,.9,.7),h2)*exp(-dd*dd/(2.*.0011*.0011))*life*tw*1.1;}}return c;}',
'void main(){float asp=uRes.x/uRes.y;vec2 uv=(gl_FragCoord.xy*2.-uRes)/uRes.y;',
' float pz=clamp(uX.z,0.,1.);float ez=pz*pz*(3.-2.*pz);float dim=(1.-.58*ez)*(1.-.22*uX.y);float sw=uX.w;',
' vec3 col=(vec3(.01,.016,.04)+vec3(.02,.04,.1)*smoothstep(-1.,1.,uv.y)*.6)*(1.-uLt);',
' float sb=(1.+.5*ez)*(1.-uLt);col+=(stars(uv+vec2(uX.x*.01,-pz*.25+sw*.06),22.,2.,uT)*1.1+stars(uv+vec2(0.,-pz*.8+sw*.16),11.,7.,uT)*1.5+stars(uv*1.7+vec2(3.,-pz*.45+sw*.1),34.,11.,uT)*.45)*sb;',
' col+=bigstar(uv+vec2(uX.x*.01,-pz*.25+sw*.06)-vec2(min(.92,asp*.64),.29),uT)*vec3(.88,.94,1.)*1.05*sb*(1.-.68*smoothstep(.0,.2,pz));',
' col+=(meteor(uv,asp,9.1,3.,uT)+meteor(uv,asp,13.7,8.,uT))*sb;',
' float Rp=mix(3.4,3.0,ez);float hy=mix(asp>1.1?-.26:-.1,asp>1.1?-.52:-.4,ez);vec2 c=vec2(0.,hy-Rp);vec2 p=uv-c;float r=length(p);',
' vec3 L=normalize(vec3(.3,.4,.86));',
' vec3 n=vec3(p/Rp,sqrt(max(0.,1.-(r/Rp)*(r/Rp))));',
' float a=uRot;vec3 m0=vec3(n.x,n.y*.697-n.z*.717,n.y*.717+n.z*.697);vec3 q=vec3(m0.x*cos(a)+m0.z*sin(a),m0.y,-m0.x*sin(a)+m0.z*cos(a));',
' vec2 uvA=vec2(atan(q.x,q.z)*.15915494+.5,asin(clamp(q.y,-1.,1.))*.31830989+.5);vec2 uvB=vec2(fract(uvA.x+.5),uvA.y);',
' vec2 dxA=dFdx(uvA),dyA=dFdy(uvA),dxB=dFdx(uvB),dyB=dFdy(uvB);bool useB=dot(dxB,dxB)+dot(dyB,dyB)<dot(dxA,dxA)+dot(dyA,dyA);vec2 gx=(useB?dxB:dxA)*(1.+uX.y*26.),gy=(useB?dyB:dyA)*(1.+uX.y*26.);',
' vec3 alb=pow(textureGrad(uD,uvA,gx,gy).rgb,vec3(2.2));vec3 mk=textureGrad(uM,uvA,gx,gy).rgb;',
' float cl=smoothstep(.2,.82,textureGrad(uM,uvA+vec2(uT*.0006,0.),gx,gy).b)*.7*smoothstep(.03,.32,n.z);',
' if(r<Rp){',
'  float water=smoothstep(.35,.75,mk.r);float dif=dot(n,L);float day=smoothstep(-.06,.32,dif);',
'  vec3 H=normalize(L+vec3(0.,0.,1.));float spec=pow(max(dot(n,H),0.),75.)*water*(1.-cl)*day;',
'  vec3 lit=alb*(.03+day*2.7);lit+=vec3(1.,.93,.8)*spec*1.5;',
'  vec3 cc=vec3(.95,.97,1.)*(day*1.15+.025)+vec3(1.,.5,.2)*exp(-dif*dif*60.)*.3;lit=mix(lit,cc,cl*.88);',
'  lit+=vec3(1.,.42,.12)*exp(-dif*dif*50.)*.1*(.3+(1.-water));',
'  float city=pow(mk.g,.6)*(1.-smoothstep(-.1,.08,dif))*(1.-cl*.85);lit+=vec3(1.,.72,.36)*city*1.6;',
'  float fr=1.-n.z;lit+=vec3(.2,.45,1.)*pow(fr,3.2)*(.08+1.2*smoothstep(-.45,.5,dif));',
'  lit=mix(lit,vec3(.22,.42,.85)*(.1+day*.8),pow(fr,5.)*.45);',
'  col=lit*dim*uLd;}',
' else{vec2 dir=p/r;float lim=dot(dir,normalize(L.xy))*.5+.5;float d=r-Rp;',
'  col+=vec3(.2,.45,1.)*exp(-d*34.)*(.25+.85*lim)*dim;col+=vec3(.12,.3,.85)*exp(-d*9.)*(.05+.3*lim)*dim;col+=vec3(.85,.93,1.)*exp(-d*170.)*.4*(.25+lim)*dim;}',
' vec2 sun=c+normalize(L.xy)*Rp;col+=vec3(1.,.8,.55)*exp(-length(uv-sun)*3.5)*.35*dim;',
' col*=1.-uV.w*smoothstep(.6,2.1,length(uv*vec2(.62,1.))*(1.-.8*uLt));col=1.-exp(-col*1.3);',
' if(uLt>.001){vec3 sk=mix(vec3(.96,.975,1.),vec3(.72,.83,.97),smoothstep(-.6,1.5,uv.y));float ins=1.-smoothstep(Rp-.006,Rp+.006,r);vec3 lc=1.-(1.-sk)*(1.-col*.85);vec3 ce=min(col*1.35+vec3(.02,.05,.1),1.);col=mix(col,mix(lc,ce,ins),uLt);}',
' o=vec4(col,1.);}'].join('\n');

var reduce=matchMedia('(prefers-reduced-motion: reduce)').matches;
var cv=document.getElementById('espacio'),doc=document.documentElement;
if(!cv)return;
var saveData=navigator.connection&&navigator.connection.saveData;
var gl=null,U=null;
if(!reduce&&!saveData){try{gl=cv.getContext('webgl2',{antialias:false,alpha:false,powerPreference:'low-power'})}catch(e){gl=null}}
function sh(src,type){var s=gl.createShader(type);gl.shaderSource(s,src);gl.compileShader(s);return gl.getShaderParameter(s,gl.COMPILE_STATUS)?s:null}
if(gl){var vs=sh(VS,gl.VERTEX_SHADER),fs=sh(FS,gl.FRAGMENT_SHADER);if(vs&&fs){var pr=gl.createProgram();gl.attachShader(pr,vs);gl.attachShader(pr,fs);gl.linkProgram(pr);
  if(gl.getProgramParameter(pr,gl.LINK_STATUS)){gl.useProgram(pr);U={r:gl.getUniformLocation(pr,'uRes'),t:gl.getUniformLocation(pr,'uT'),x:gl.getUniformLocation(pr,'uX'),v:gl.getUniformLocation(pr,'uV'),rot:gl.getUniformLocation(pr,'uRot'),ld:gl.getUniformLocation(pr,'uLd'),lt:gl.getUniformLocation(pr,'uLt'),d:gl.getUniformLocation(pr,'uD'),m:gl.getUniformLocation(pr,'uM')};gl.bindVertexArray(gl.createVertexArray())}}}
/* Sin WebGL2, con «reducir movimiento» o con ahorro de datos: queda el cielo de CSS (html[data-nogpu]) y la página se ve igual de bien. */
if(!U){cv.style.display='none';doc.setAttribute('data-nogpu','');return}
doc.setAttribute('data-gpu','');
var base=cv.getAttribute('data-base')||'';
var texOK=0,ldv=0,rotv=0;
function mkTex(unit,uri,px){var tx=gl.createTexture();gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tx);
 gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,1,1,0,gl.RGBA,gl.UNSIGNED_BYTE,new Uint8Array(px));
 gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.REPEAT);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
 var im=new Image();im.decoding='async';
 im.onload=function(){var src=im,mx=gl.getParameter(gl.MAX_TEXTURE_SIZE);
  if(im.width>mx){var k=mx/im.width,cc=document.createElement('canvas');cc.width=mx;cc.height=Math.round(im.height*k);cc.getContext('2d').drawImage(im,0,0,cc.width,cc.height);src=cc}
  gl.activeTexture(gl.TEXTURE0+unit);gl.bindTexture(gl.TEXTURE_2D,tx);gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,src);gl.generateMipmap(gl.TEXTURE_2D);
  gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR_MIPMAP_LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
  var an=gl.getExtension('EXT_texture_filter_anisotropic');if(an)gl.texParameterf(gl.TEXTURE_2D,an.TEXTURE_MAX_ANISOTROPY_EXT,Math.min(8,gl.getParameter(an.MAX_TEXTURE_MAX_ANISOTROPY_EXT)));
  texOK++};
 im.src=uri}
gl.uniform1i(U.d,0);gl.uniform1i(U.m,1);
mkTex(0,base+'assets/espacio/'+cv.getAttribute('data-dia'),[6,18,50,255]);mkTex(1,base+'assets/espacio/'+cv.getAttribute('data-mascara'),[255,0,0,255]);
var cur=[.972,.8,.22,.55],mx=0,tx=0,t0=performance.now(),last=0,bl=0,inicio=doc.classList.contains('home')||document.body.classList.contains('page-inicio');
function draw(now){
  var dpr=Math.min(devicePixelRatio||1,1.75)*.85;
  var w=Math.max(2,Math.round(cv.clientWidth*dpr)),h=Math.max(2,Math.round(cv.clientHeight*dpr));
  if(cv.width!==w||cv.height!==h){cv.width=w;cv.height=h}
  var dt=Math.min(.25,(now-(last||now))/1000);last=now;var k=1-Math.exp(-dt*6);mx+=(tx-mx)*k;
  gl.viewport(0,0,w,h);gl.uniform2f(U.r,w,h);gl.uniform1f(U.t,(now-t0)/1000);
  /* La Tierra baja y se atenúa al desplazarte; en las demás páginas ya está abajo. */
  var sy=scrollY,pz=inicio?Math.max(0,Math.min(1,sy/(innerHeight*.9))):1,bt=inicio?Math.max(0,Math.min(1,(sy-innerHeight*.15)/(innerHeight*.7))):1;
  bl+=(bt-bl)*(1-Math.exp(-dt*4));
  gl.uniform4f(U.x,mx,bl,pz,sy/1000);
  gl.uniform4f(U.v,cur[0],cur[1],cur[2],cur[3]);
  rotv+=dt*.015;ldv+=((texOK>=2?1:0)-ldv)*(1-Math.exp(-dt*2));gl.uniform1f(U.rot,rotv+1.2);
  var t=doc.getAttribute('data-theme'),light=t?t==='light':matchMedia('(prefers-color-scheme: light)').matches,ltT=light?1:0;
  if(window.__lt===undefined)window.__lt=ltT;window.__lt+=(ltT-window.__lt)*(1-Math.exp(-dt*5));gl.uniform1f(U.lt,window.__lt);
  gl.uniform1f(U.ld,.15+.85*ldv);gl.drawArrays(gl.TRIANGLES,0,3)}
var vis=true;
function frame(now){if(!vis||document.hidden){requestAnimationFrame(frame);return}requestAnimationFrame(frame);draw(now)}
addEventListener('pointermove',function(e){tx=(e.clientX/innerWidth)*2-1},{passive:true});
document.addEventListener('visibilitychange',function(){last=0});
requestAnimationFrame(frame);
})();
