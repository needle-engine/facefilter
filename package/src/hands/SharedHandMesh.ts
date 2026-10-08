/** Reference-counted ownership independent of scene visibility and async model loading. */
export class SharedHandMesh {
    private requests = 0;
    private providers = new Set<object>();
    private implicit: (() => void) | null = null;
    constructor(private readonly create: () => () => void) {}
    request(): () => void {
        this.requests++; this.reconcile();
        let released = false;
        return () => { if (!released) { released = true; this.requests--; this.reconcile(); } };
    }
    provide(provider: object): () => void {
        this.providers.add(provider); this.reconcile();
        let released = false;
        return () => { if (!released) { released = true; this.providers.delete(provider); this.reconcile(); } };
    }
    private reconcile() {
        const needed = this.requests > 0 && this.providers.size === 0;
        if (!needed && this.implicit) { const dispose = this.implicit; this.implicit = null; dispose(); }
        else if (needed && !this.implicit) this.implicit = this.create();
    }
}
