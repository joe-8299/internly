"""OPTIONAL real-browser checks (Playwright for Python). Not needed for `npm test`.

    pip install playwright && playwright install chromium
    DB_FILE=:memory: PORT=3222 node --disable-warning=ExperimentalWarning src/server.js --chaos   # terminal 1
    python tests/e2e/browser_checks.py                                                         # terminal 2

Covers: CSP-clean page load, filters + URL state, pagination, form validation, success, duplicate (409),
failure states (error / flaky retry / slow), 375px mobile layout, touch targets, dark mode, keyboard flow.
Screenshots are written to docs/screenshots/.
"""
import asyncio, json, sys
from playwright.async_api import async_playwright
B="http://127.0.0.1:3222"
import os
OUT=os.path.join(os.path.dirname(os.path.abspath(__file__)),"..","..","docs","screenshots")
results=[]
def ok(name,cond,extra=""):
    results.append((name,bool(cond),extra)); print(("PASS " if cond else "FAIL ")+name, extra)

async def main():
    async with async_playwright() as p:
        br=await p.chromium.launch()
        # ---------- desktop ----------
        sctx=await br.new_context(viewport={"width":1280,"height":900})
        sp=await sctx.new_page(); serr=[]
        sp.on("console",lambda m: serr.append(m.text) if m.type in("error","warning") else None)
        sp.on("pageerror",lambda e: serr.append(str(e)))
        await sp.goto(B+"/"); await sp.wait_for_selector("#grid:not([hidden])")
        await sp.click("button[data-id]"); await sp.wait_for_selector("#apply-dialog[open]")
        ok("CSP enforced: page + dialog load with zero console errors/violations", not serr, str(serr))
        await sctx.close()
        ctx=await br.new_context(viewport={"width":1280,"height":900}, bypass_csp=True)
        pg=await ctx.new_page()
        errors=[]; pg.on("console",lambda m: errors.append(m.text) if m.type in("error","warning") else None)
        pg.on("pageerror",lambda e: errors.append(str(e)))
        await pg.goto(B+"/")
        await pg.wait_for_selector("#grid:not([hidden])")
        ok("desktop: listings render", await pg.locator("article.card").count()==6)
        ok("desktop: status text", "of 12" in await pg.inner_text("#status"), await pg.inner_text("#status"))
        await pg.screenshot(path=OUT+"/desktop-list.png")
        # filter + URL sync
        await pg.fill("#f-q","sql"); await pg.wait_for_function("location.search.includes('q=sql')")
        await pg.wait_for_selector("#grid:not([hidden])")
        n=await pg.locator("article.card").count()
        ok("desktop: search narrows results and syncs URL", 0<n<6 and "q=sql" in pg.url, f"{n} cards, {pg.url}")
        await pg.reload(); await pg.wait_for_selector("#grid:not([hidden])")
        ok("desktop: filter restored from URL after reload", await pg.input_value("#f-q")=="sql" and await pg.locator("article.card").count()==n)
        await pg.fill("#f-q","zzzzzz"); await pg.wait_for_selector("#empty:not([hidden])")
        ok("desktop: empty state", True); await pg.screenshot(path=OUT+"/desktop-empty.png")
        await pg.click("#empty-clear"); await pg.wait_for_selector("#grid:not([hidden])")
        ok("desktop: clear filters restores list", await pg.locator("article.card").count()==6)
        # pagination
        await pg.click("#next"); await pg.wait_for_function("document.getElementById('page-info').textContent.includes('Page 2')")
        ok("desktop: pagination page 2", "page=2" in pg.url and await pg.locator("article.card").count()==6)
        await pg.click("#prev")
        await pg.wait_for_function("document.getElementById('page-info').textContent.includes('Page 1')")
        # apply: validation
        await pg.locator("button[data-id]").first.click()
        ok("desktop: dialog opens and focuses first field", await pg.evaluate("document.activeElement.id")=="a-fullName")
        await pg.click("#submit")
        ok("desktop: client validation shows errors", "name" in (await pg.inner_text("#err-fullName")).lower() and await pg.get_attribute("#a-fullName","aria-invalid")=="true")
        ok("desktop: focus moves to first invalid field", await pg.evaluate("document.activeElement.id")=="a-fullName")
        await pg.screenshot(path=OUT+"/desktop-form-errors.png")
        await pg.fill("#a-fullName","Joe Test"); await pg.fill("#a-email","joe@example.com")
        await pg.fill("#a-coverNote","I like building reliable web apps and want to learn from your team."); await pg.check("#a-consent")
        await pg.click("#submit"); await pg.wait_for_selector("#success:not([hidden])")
        ok("desktop: successful application", "received" in (await pg.inner_text("#success-message")))
        await pg.screenshot(path=OUT+"/desktop-success.png")
        await pg.click("#success-close")
        ok("desktop: applied listing shows disabled 'Applied'", "Applied" in await pg.locator("button[data-id]").first.inner_text() and await pg.locator("button[data-id]").first.is_disabled())
        await pg.reload(); await pg.wait_for_selector("#grid:not([hidden])")
        ok("desktop: applied state persists after reload", await pg.locator("button[data-id]").first.is_disabled())
        # escape closes dialog and returns focus
        await pg.locator("button[data-id]:not([disabled])").first.click(); await pg.keyboard.press("Escape")
        ok("desktop: Escape closes dialog", not await pg.evaluate("document.getElementById('apply-dialog').open"))
        ok("desktop: no console errors or CSP violations", not errors, str(errors))
        # server-side error mapping: bypass client validation by intercepting? use duplicate
        ctx2=await br.new_context(viewport={"width":1280,"height":900}, bypass_csp=True); p2=await ctx2.new_page()
        await p2.goto(B+"/"); await p2.wait_for_selector("#grid:not([hidden])")
        await p2.locator("button[data-id]").first.click()
        await p2.fill("#a-fullName","Joe Again"); await p2.fill("#a-email","joe@example.com")
        await p2.fill("#a-coverNote","Second attempt with the same email address, should be rejected."); await p2.check("#a-consent")
        await p2.click("#submit"); await p2.wait_for_function("document.getElementById('err-email').textContent.length>0")
        ok("desktop: server 409 shown inline on email field", "already" in (await p2.inner_text("#err-email")).lower())
        await ctx2.close()
        # ---------- failure states ----------
        pe=await ctx.new_page()
        await pe.goto(B+"/?simulate=error"); await pe.wait_for_selector("#error:not([hidden])", timeout=15000)
        ok("failure: error panel with retry", await pe.is_visible("#retry"), await pe.inner_text("#error-message"))
        await pe.screenshot(path=OUT+"/desktop-error.png")
        pf=await ctx.new_page(); await pf.goto(B+"/?simulate=flaky")
        await pf.wait_for_selector("#grid:not([hidden])", timeout=15000)
        ok("failure: flaky API recovers via automatic retry", await pf.locator("article.card").count()>0)
        ps=await ctx.new_page(); await ps.goto(B+"/?simulate=slow")
        await ps.wait_for_selector("#loading:not([hidden])")
        await ps.screenshot(path=OUT+"/desktop-loading.png")
        ok("failure: slow API shows loading skeleton", True)
        await ctx.close()
        # ---------- mobile ----------
        mctx=await br.new_context(viewport={"width":375,"height":812}, device_scale_factor=2, is_mobile=True, has_touch=True, bypass_csp=True)
        m=await mctx.new_page(); merr=[]; m.on("console",lambda x: merr.append(x.text) if x.type=="error" else None)
        await m.goto(B+"/"); await m.wait_for_selector("#grid:not([hidden])")
        sw=await m.evaluate("document.documentElement.scrollWidth"); 
        ok("mobile: no horizontal scroll at 375px", sw<=375, f"scrollWidth={sw}")
        await m.screenshot(path=OUT+"/mobile-list.png")
        small=await m.evaluate("""()=>[...document.querySelectorAll('button,input,select,textarea')].filter(e=>e.offsetParent!==null&&e.type!=='checkbox').map(e=>[e.id||e.tagName,e.getBoundingClientRect().height]).filter(x=>x[1]<44)""")
        ok("mobile: touch targets >= 44px", not small, str(small))
        await m.locator("button[data-id]:not([disabled])").first.tap()
        await m.wait_for_function("document.getElementById('apply-dialog').open")
        box=await m.evaluate("(()=>{const r=document.getElementById('apply-dialog').getBoundingClientRect();return [r.left,r.right,r.bottom,innerHeight]})()")
        ok("mobile: apply form is a full-width bottom sheet", box[0]==0 and box[1]==375 and abs(box[2]-box[3])<2, str(box))
        await m.screenshot(path=OUT+"/mobile-form.png")
        fs=await m.evaluate("getComputedStyle(document.getElementById('a-email')).fontSize")
        ok("mobile: inputs are 16px (no iOS zoom)", fs=="16px", fs)
        ok("mobile: no console errors", not merr, str(merr))
        await mctx.close()
        # ---------- dark mode ----------
        dctx=await br.new_context(viewport={"width":1280,"height":800}, color_scheme="dark", bypass_csp=True); d=await dctx.new_page()
        await d.goto(B+"/"); await d.wait_for_selector("#grid:not([hidden])"); await d.screenshot(path=OUT+"/desktop-dark.png")
        ok("dark mode renders", True)
        # ---------- keyboard ----------
        kctx=await br.new_context(viewport={"width":1280,"height":800}, bypass_csp=True); k=await kctx.new_page()
        await k.goto(B+"/"); await k.wait_for_selector("#grid:not([hidden])")
        await k.keyboard.press("Tab"); first=await k.evaluate("document.activeElement.className")
        ok("keyboard: first Tab stop is the skip link", first=="skip", first)
        await k.keyboard.press("Enter")
        ok("keyboard: skip link moves to results", await k.evaluate("document.activeElement.id")=="results")
        # reachable apply button by keyboard
        for _ in range(12):
            await k.keyboard.press("Tab")
            if await k.evaluate("document.activeElement.dataset && document.activeElement.dataset.id"): break
        ok("keyboard: Apply buttons reachable with Tab", bool(await k.evaluate("document.activeElement.dataset.id")))
        await k.keyboard.press("Enter"); ok("keyboard: Enter opens dialog", await k.evaluate("document.getElementById('apply-dialog').open"))
        await br.close()
    bad=[r for r in results if not r[1]]
    print(f"\n{len(results)-len(bad)}/{len(results)} browser checks passed")
    sys.exit(1 if bad else 0)
asyncio.run(main())
