// SPDX-License-Identifier: Apache-2.0
// Copyright 2026 suhong
// Author: suhong
﻿const cp = 'http://127.0.0.1:4000';
const login = await fetch(cp + '/api/v1/auth/dev-login', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: `probe-${Date.now()}@example.com` }) });
const lb: any = await login.json(); const cookie = (login.headers.getSetCookie?.() ?? []).map((c) => c.split(';')[0]).join('; ');
const call = async (m: string, p: string, b?: any) => { const r = await fetch(cp + p, { method: m, headers: { cookie, 'content-type': 'application/json', 'x-csrf-token': lb.csrf_token }, body: b ? JSON.stringify(b) : undefined }); const t = await r.text(); return { status: r.status, body: t } }
const app1 = await call('POST', '/api/v1/apps', { slug: `probe-${Date.now().toString(36)}`, name: 'probe', template: 'node' })
console.log('create', app1.status, app1.body.slice(0, 160))
const id = JSON.parse(app1.body).id
console.log('collab', JSON.stringify(await call('GET', `/api/v1/apps/${id}/collab`)))
console.log('permissions', JSON.stringify(await call('GET', `/api/v1/apps/${id}/permissions`)))
console.log('members', JSON.stringify(await call('GET', `/api/v1/apps/${id}/members`)))

