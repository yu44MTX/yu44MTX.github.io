import argparse
import base64
import getpass
import hashlib
import json
import os
import re
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


def section(text, name):
    pattern = rf'<section\b[^>]*\bid="{name}"[^>]*>(.*?)</section>'
    match = re.search(pattern, text, re.S)
    if not match:
        raise ValueError(f'Missing section: {name}')
    return pattern, match.group(1)


def locked(name, title):
    return f'''<section id="{name}"><div class="wrap privacy-panel">
<h2>{title}</h2><p>此部分需要密码。输入正确密码后可查看预算与价格依据。</p>
<form class="privacy-form" data-private-unlock>
<label for="{name}-password">访问密码</label>
<input id="{name}-password" type="password" autocomplete="off" required disabled>
<button type="submit" disabled>解锁查看</button>
<p data-private-error role="alert"></p><p data-private-status role="status" aria-live="polite"></p>
</form><noscript>请启用JavaScript，并使用支持加密功能的浏览器。</noscript></div></section>'''


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--source', type=Path, required=True)
    parser.add_argument('--destination', type=Path, required=True)
    args = parser.parse_args()
    source, destination = args.source.resolve(), args.destination.resolve()
    if source == destination:
        raise ValueError('Use a separate private plaintext release snapshot')
    password = getpass.getpass('Encryption password: ')
    if not password:
        raise ValueError('Password required')
    text = (source / 'index.html').read_text()
    budget_pattern, budget_html = section(text, 'budget')
    sources_pattern, sources_html = section(text, 'sources')
    data = json.loads((source / 'budget.json').read_text())
    paths = [
        'budget.json', '武汉预算清单.csv', '设计调整与询价说明.md',
        '次卧功能优化_20261030/预算调整.json',
        '次卧功能优化_20261030/次卧预算调整.csv',
        '父母主卧与衣帽间_20261030/预算调整.json',
    ]
    files = []
    for number, relative in enumerate(paths):
        path = source / relative
        mime = {'.json': 'application/json', '.csv': 'text/csv', '.md': 'text/markdown'}[path.suffix]
        files.append({'id': f'file-{number}', 'name': path.name, 'mime': mime,
                      'base64': base64.b64encode(path.read_bytes()).decode('ascii')})
    budget_html = budget_html.replace(
        '<a href="武汉预算清单.csv" download>下载原始预算 CSV</a>',
        '<button type="button" data-private-file="file-1">下载原始预算 CSV</button>')
    budget_html = budget_html.replace(
        '修改仅在当前浏览器尽力保存。原始CSV保持不变，导出当前修改可留存你的版本。',
        '修改只保留在本次解锁页面，刷新或重新锁定后清除；请导出留存。')
    budget_html = re.sub(r'<noscript>.*?</noscript>', '', budget_html, flags=re.S)
    downloads = ''.join(
        f'<button type="button" data-private-file="{file["id"]}">{file["name"]}</button>'
        for file in files if file['id'] != 'file-1')
    budget_html += '<div class="wrap"><h3>预算与说明文件</h3><div class="tools">' + downloads + '</div></div>'
    payload = {'schema': 1, 'data': data, 'sections': {'budget': budget_html, 'sources': sources_html}, 'files': files}
    salt, iv = os.urandom(16), os.urandom(12)
    key = hashlib.pbkdf2_hmac('sha256', password.encode('utf-8'), salt, 600000, 32)
    ciphertext = AESGCM(key).encrypt(iv, json.dumps(payload, ensure_ascii=False).encode('utf-8'), b'home-design-private-v1')
    envelope = {'version': 1, 'kdf': 'PBKDF2-SHA256', 'iterations': 600000,
                'salt': base64.b64encode(salt).decode('ascii'),
                'iv': base64.b64encode(iv).decode('ascii'),
                'ciphertext': base64.b64encode(ciphertext).decode('ascii')}
    private = destination / 'private'
    private.mkdir(exist_ok=True)
    (private / 'budget.enc.json').write_text(json.dumps(envelope, indent=2))
    script_match = re.search(r'<script>\s*(const data=.*?)</script>', text, re.S)
    if not script_match:
        raise ValueError('Original budget renderer not found')
    renderer = script_match.group(1)
    gallery = renderer[renderer.index('const dialog='):renderer.index('renderRows();renderTotals();', renderer.index('const dialog='))]
    renderer = renderer[:renderer.index('const dialog=')]
    renderer = re.sub(r'^const data=.*?\n', '', renderer, count=1)
    renderer = re.sub(r"^const key=.*?\n", '', renderer, count=1)
    renderer = re.sub(r'try\{const saved=.*?catch\(e\)\{\}\n', '', renderer, count=1)
    renderer = renderer.replace('function save(){try{localStorage.setItem(key,JSON.stringify(edits))}catch(e){}}', 'function save(){}')
    renderer = renderer.replace("'总预算200000'", "'总预算'+data.meta.budget")
    renderer = renderer.replace('当前分配已超出20万，请下调或取消部分项目。', '当前分配已超出预算，请下调或取消部分项目。')
    renderer = renderer.replace('当前分配在20万以内。', '当前分配在预算内。')
    ending = '''
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
'''
    (private / 'budget.mjs').write_text('export function mountBudget(payload){\nconst data=payload.data;\n' + renderer + ending)
    text = re.sub(budget_pattern, lambda _: locked('budget', '预算 · 需要密码'), text, count=1, flags=re.S)
    text = re.sub(sources_pattern, lambda _: locked('sources', '价格依据 · 需要密码'), text, count=1, flags=re.S)
    text = re.sub(r'<div class="notice"><b>第6版父母房调整：</b>.*?</div>',
                  '<div class="wrap notice">当前方案的预算、价格依据和相关下载文件需输入密码查看。</div>', text, count=1, flags=re.S)
    text = re.sub(r'<script\b[^>]*id="budget-data"[^>]*>.*?</script>', '', text, flags=re.S)
    text = re.sub(r'<script>\s*const data=.*?</script>', lambda _: '<script>\n' + gallery + '\n</script><script type="module" src="private/gate.mjs"></script>', text, count=1, flags=re.S)
    text = text.replace('</style>', '</style><link rel="stylesheet" href="private/gate.css">', 1)
    text = re.sub(r'<a href="(?:设计调整与询价说明.md|budget.json)"[^>]*>.*?</a>', '<a href="#budget">预算及说明文件（需密码）</a>', text)
    text = text.replace('预算20万元，', '').replace('20万预算', '预算 🔒')
    text = text.replace('20万元软装与定制柜方案', '软装与定制柜方案').replace('20万精修方案', '精修方案')
    text = text.replace('预算修改保存在当前浏览器，可导出留存。', '预算与价格依据需密码解锁，预算修改可导出留存。')
    (destination / 'index.html').write_text(text)
    for relative in ['次卧功能优化_20261030/index.html', '父母主卧与衣帽间_20261030/index.html']:
        text = (source / relative).read_text()
        pattern, _ = section(text, 'budget')
        replacement = '<section id="budget"><h2>预算与价格依据</h2><p>此部分需要密码，请前往全屋预算页面解锁。</p><a href="../index.html#budget">输入密码查看预算 →</a></section>'
        text = re.sub(pattern, lambda _: replacement, text, count=1, flags=re.S)
        for path in paths:
            text = text.replace(f'href="{Path(path).name}"', 'href="../index.html#budget"')
        text = re.sub(r'(<a\b[^>]*href="../index.html#budget"[^>]*?)\sdownload(?:="[^"]*")?', r'\1', text)
        text = text.replace('下载预算变化', '查看预算（需密码）')
        (destination / relative).write_text(text)
    for relative in ['次卧功能优化_20261030/sources/layout.json', '父母主卧与衣帽间_20261030/sources/layout.json']:
        path = destination / relative
        layout = json.loads((source / relative).read_text())
        layout.pop('budget', None)
        path.write_text(json.dumps(layout, ensure_ascii=False, indent=2))
    for relative in paths:
        (destination / relative).unlink(missing_ok=True)
    print('Encrypted budget bundle and password-gated pages generated; password not saved.')


if __name__ == '__main__':
    main()
