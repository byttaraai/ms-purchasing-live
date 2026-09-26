"""Run the existing synthetic browser assertions in isolated real browser contexts."""
from pathlib import Path
import argparse
import re
import shutil
from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]


def inline_fixture(filename: str) -> str:
    """Offline local QA only: embed the exact local files without altering app CSP."""
    text = (ROOT / filename).read_text()
    text = re.sub(r'<script src="([^"]+)"></script>',
                  lambda m: '<script>' + (ROOT / m[1].split('?')[0]).read_text().replace('</script', '<\\/script') + '</script>', text)
    text = re.sub(r'<link rel="stylesheet" href="([^"]+)">',
                  lambda m: '<style>' + (ROOT / m[1].split('?')[0]).read_text() + '</style>', text)
    storage = """<script>for(const name of ['localStorage','sessionStorage']){const data={};Object.defineProperty(window,name,{value:{getItem(k){return data[k]??null},setItem(k,v){data[k]=String(v)},removeItem(k){delete data[k]},clear(){for(const k in data)delete data[k]}}})}</script>"""
    return text.replace('<head>', '<head>' + storage, 1)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument('--inline', action='store_true', help='Offline file embedding for local QA')
    parser.add_argument('--base-url', default='http://127.0.0.1:8765')
    args = parser.parse_args()
    chrome = shutil.which('google-chrome') or shutil.which('chromium') or shutil.which('chromium-browser')
    if not chrome:
        raise RuntimeError('Chromium/Chrome is required')
    cases = [('smoke.html', 'workspace-smoke-result', 1440, 1000),
             ('quest-smoke.html', 'quest-ux-result', 1440, 1000),
             ('quest-smoke.html', 'quest-ux-result', 1024, 768),
             ('quest-smoke.html', 'quest-ux-result', 390, 844)]
    with sync_playwright() as playwright:
        browser = playwright.chromium.launch(executable_path=chrome, headless=True,
                   args=['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage'])
        try:
            for filename, result_id, width, height in cases:
                context = browser.new_context(viewport={'width': width, 'height': height})
                page = context.new_page()
                errors = []
                page.on('pageerror', lambda error: errors.append(str(error)))
                # Only synthetic local assets may be fetched. No production requests.
                context.route('**/*', lambda route: route.continue_() if route.request.url.startswith(args.base_url + '/') else route.abort())
                try:
                    if args.inline:
                        page.set_content(inline_fixture(filename), wait_until='load', timeout=20000)
                    else:
                        page.goto(args.base_url + '/' + filename, wait_until='load', timeout=20000)
                    result = page.locator('#' + result_id)
                    result.filter(has_text=re.compile(r'^(PASS|FAIL):')).wait_for(state='attached', timeout=25000)
                    message = result.inner_text()
                    print(f'{width}x{height}: {message}', flush=True)
                    assert message.startswith('PASS:'), message
                    assert not errors, 'Browser page errors: ' + '; '.join(errors)
                except Exception:
                    print('Browser failure:', filename, width, height, page.url, errors, flush=True)
                    print(page.locator('body').inner_text()[-4000:], flush=True)
                    raise
                finally:
                    context.close()
        finally:
            browser.close()


if __name__ == '__main__':
    main()
