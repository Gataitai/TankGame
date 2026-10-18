// GPU resources (textures, geometries, materials) that are reused by many entities are
// flagged as "shared" so that Entity.dispose() doesn't free them while others still use them.

type HasUserData = { userData: Record<string, any> };

export function markShared<T extends HasUserData>(resource: T): T {
    resource.userData.shared = true;
    return resource;
}

export function isShared(resource: HasUserData | null | undefined): boolean {
    return !!resource?.userData?.shared;
}
