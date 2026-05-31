/* Data loader skeleton for ITS Maps
 * - fetchWithTimeout(url, ms)
 * - loadSnapshot(url)
 * - startAutoRefresh(url, intervalMs, onUpdate)
 * - stopAutoRefresh(id)
 * - showSkeleton(container?) / hideSkeleton()
 *
 * This is intentionally minimal — plug into `main.ts` where you manage
 * application state and UI. Types are kept loose to stay flexible during
 * incremental integration.
 */

export async function fetchWithTimeout(url: string, timeoutMs = 10000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeoutMs);
    try {
        const res = await fetch(url, { signal: controller.signal });
        return res;
    } finally {
        clearTimeout(id);
    }
}

export async function loadSnapshot<T = any>(url: string, timeoutMs = 10000): Promise<T> {
    const res = await fetchWithTimeout(url, timeoutMs);
    if (!res.ok) throw new Error(`Failed to load snapshot: ${res.status} ${res.statusText}`);
    const json = await res.json();
    return json as T;
}

export function startAutoRefresh<T = any>(
    url: string,
    intervalMs: number,
    onUpdate: (data: T) => void,
    onError?: (err: unknown) => void,
): number {
    let active = true;
    const doFetch = async () => {
        try {
            const data = await loadSnapshot<T>(url);
            if (!active) return;
            onUpdate(data);
        } catch (err) {
            onError?.(err);
        }
    };
    // Run immediately then set interval
    void doFetch();
    const id = window.setInterval(doFetch, intervalMs);
    // return numeric id that can be passed to stopAutoRefresh
    return id;
}

export function stopAutoRefresh(id: number): void {
    clearInterval(id);
}

let _skeletonEl: HTMLElement | null = null;
export function showSkeleton(container: HTMLElement | null = null, lines = 6) {
    const root = container || document.body;
    if (_skeletonEl) return;
    const el = document.createElement('div');
    el.className = 'its-skeleton';
    el.style.cssText = 'pointer-events:none;opacity:0.9;padding:12px;';
    const list = document.createElement('div');
    list.style.display = 'grid';
    list.style.gap = '8px';
    for (let i = 0; i < lines; i++) {
        const row = document.createElement('div');
        row.style.height = (12 + (i % 3) * 6) + 'px';
        row.style.background = 'linear-gradient(90deg,#eee,#f7f7f7,#eee)';
        row.style.borderRadius = '6px';
        list.appendChild(row);
    }
    el.appendChild(list);
    root.appendChild(el);
    _skeletonEl = el;
}

export function hideSkeleton() {
    if (!_skeletonEl) return;
    _skeletonEl.remove();
    _skeletonEl = null;
}

export default {
    fetchWithTimeout,
    loadSnapshot,
    startAutoRefresh,
    stopAutoRefresh,
    showSkeleton,
    hideSkeleton,
};
