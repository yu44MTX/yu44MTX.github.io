export function mountBudget(payload){
const data=payload.data;
let edits={};
const fmt=n=>'¥'+Math.round(n).toLocaleString('zh-CN');
const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const cats=[...new Set(data.items.map(i=>i.category))];
const colors=['#67452f','#8d9477','#c5ad85','#91a4a3','#aba6a0','#d7cbb3'];
const val=i=>{const n=edits[i.id]?.amount;return typeof n==='number'&&Number.isFinite(n)&&n>=0&&n<=10000000?n:i.target_total};
const active=i=>edits[i.id]?.included!==false;
function save(){}
const filter=document.getElementById('filter');
cats.forEach(c=>{const o=document.createElement('option');o.value=c;o.textContent=c;filter.appendChild(o)});
function renderTotals(){
 const selected=data.items.filter(active), total=selected.reduce((s,i)=>s+val(i),0), core=selected.filter(i=>['定制柜','成品家具','软装照明'].includes(i.category)).reduce((s,i)=>s+val(i),0);
 document.getElementById('planned').textContent=fmt(total);document.getElementById('core').textContent=fmt(core);document.getElementById('balance').textContent=fmt(data.meta.budget-total);document.getElementById('plannedBox').classList.toggle('alert',total>data.meta.budget);
 const reserve=selected.find(i=>i.id==='contingency');
 document.getElementById('budgetStatus').textContent=(total>data.meta.budget?'当前分配已超出预算，请下调或取消部分项目。':'当前分配在预算内。')+(reserve?'其中'+fmt(val(reserve))+'是未支出的机动金。':'当前没有保留机动金。');
 document.getElementById('bars').innerHTML=cats.map((c,n)=>{const s=selected.filter(i=>i.category===c).reduce((a,i)=>a+val(i),0);return '<span style="background:'+colors[n]+';width:'+(total?s/total*100:0)+'%"></span>'}).join('');
 document.getElementById('legend').innerHTML=cats.map((c,n)=>'<span><i style="background:'+colors[n]+'"></i>'+c+' '+fmt(selected.filter(i=>i.category===c).reduce((s,i)=>s+val(i),0))+'</span>').join('');
}
function renderRows(){
 document.getElementById('items').innerHTML=data.items.filter(i=>filter.value==='all'||filter.value===i.category).map(i=>'<tr><td><label><input type="checkbox" data-id="'+i.id+'" class="include" '+(active(i)?'checked':'')+'> '+esc(i.name)+'</label><small>'+esc(i.room)+' · '+esc(i.category)+'</small><span class="badge">'+esc(i.stage)+'</span></td><td>'+i.quantity+' '+esc(i.unit)+'<small>单价 '+fmt(i.unit_low)+' 至 '+fmt(i.unit_high)+'</small></td><td class="spec">'+esc(i.specification)+'<small>'+esc(i.basis)+(i.sources?' · '+esc(i.sources):'')+'</small></td><td class="price">'+fmt(i.estimate_low_total)+'<br>至 '+fmt(i.estimate_high_total)+'</td><td><input type="number" min="0" max="10000000" step="100" data-id="'+i.id+'" aria-label="'+esc(i.name)+'控制总价" value="'+val(i)+'"></td></tr>').join('');
}
document.getElementById('items').addEventListener('change',e=>{const id=e.target.dataset.id;if(!id||!data.items.some(i=>i.id===id))return;edits[id]??={};if(e.target.type==='checkbox'){edits[id].included=e.target.checked}else if(e.target.type==='number'){const n=Number(e.target.value);if(e.target.value.trim()===''||!Number.isFinite(n)||n<0||n>10000000){renderRows();return}edits[id].amount=n}save();renderTotals()});
filter.addEventListener('change',renderRows);
document.getElementById('reset').addEventListener('click',()=>{edits={};save();renderRows();renderTotals()});
const csvCell=s=>'"'+String(s).replace(/"/g,'""')+'"';
document.getElementById('export').addEventListener('click',()=>{let total=0;const rows=[['纳入预算','类别','房间','项目','数量','单位','控制总价','规格']];for(const i of data.items){if(active(i))total+=val(i);rows.push([active(i)?'是':'否',i.category,i.room,i.name,i.quantity,i.unit,val(i),i.specification])}rows.push(['','','','当前分配合计','','',total,'含已勾选预留']);rows.push(['','','','尚未分配','','',data.meta.budget-total,'总预算'+data.meta.budget]);const blob=new Blob(['﻿'+rows.map(r=>r.map(csvCell).join(',')).join('\r\n')],{type:'text/csv;charset=utf-8'});const url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download='武汉预算_当前修改.csv';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)});
document.getElementById('sourceList').innerHTML=data.sources.map(s=>'<div class="source"><b>'+s.id+' · <a href="'+esc(s.url)+'" target="_blank" rel="noopener">'+esc(s.title)+'</a></b><p>'+esc(s.evidence)+'</p></div>').join('');

const urls=new Set();
document.querySelectorAll('[data-private-file]').forEach(button=>button.addEventListener('click',()=>{
 const file=payload.files.find(file=>file.id===button.dataset.privateFile);
 if(!file)return;
 const bytes=Uint8Array.from(atob(file.base64),char=>char.charCodeAt(0));
 const url=URL.createObjectURL(new Blob([bytes],{type:file.mime+';charset=utf-8'}));urls.add(url);
 const link=document.createElement('a');link.href=url;link.download=file.name;link.click();
 setTimeout(()=>{URL.revokeObjectURL(url);urls.delete(url)},1000);
}));
renderRows();renderTotals();
return ()=>{urls.forEach(url=>URL.revokeObjectURL(url));urls.clear();edits={}};
}
