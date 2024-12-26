    import {Box3, Material, Mesh, Sphere, Vector3} from "three";

    abstract class Entity {
        private _position: Vector3;
        public get position(): Vector3 {
            return this._position;
        }
        public set position(value: Vector3) {
            this._position = value;
            this._mesh.position.set(value.x, value.y, value.z);
        }

        private _mesh: Mesh = new Mesh();
        public get mesh(): Mesh {
            return this._mesh;
        }
        public set mesh(value: Mesh) {
            this._mesh = value;
        }

        private _collider?: Box3 | Sphere;
        public get collider(): Box3 | Sphere | undefined {
            return this._collider;
        }
        public set collider(value: Box3 | Sphere | undefined) {
            this._collider = value;
        }

        private _shouldDispose: boolean = false;
        public get shouldDispose(): boolean {
            return this._shouldDispose;
        }
        public set shouldDispose(value: boolean) {
            this._shouldDispose = value;
        }

        constructor(position: Vector3) {
            this._position = position;
            this._mesh.position.set(position.x, position.y, position.z);
        }

        public abstract load(): Promise<void>;

        public dispose(): void {
            // Dispose all child meshes' geometries and materials
            this._mesh.traverse((child) => {
                if ((child as Mesh).isMesh) {
                    const mesh = child as Mesh;

                    // Dispose geometry
                    if (mesh.geometry) {
                        mesh.geometry.dispose();
                    }

                    // Dispose material(s)
                    if (Array.isArray(mesh.material)) {
                        mesh.material.forEach((material) => this.disposeMaterial(material));
                    } else {
                        this.disposeMaterial(mesh.material);
                    }
                }
            });

            // Clear the mesh to release references
            this._mesh.clear();
        }

        private disposeMaterial(material: Material | undefined): void {
            if (!material) return;

            // Dispose associated textures
            const mat = material as any;
            if (mat.map) mat.map.dispose();
            if (mat.normalMap) mat.normalMap.dispose();
            if (mat.roughnessMap) mat.roughnessMap.dispose();
            if (mat.metalnessMap) mat.metalnessMap.dispose();

            // Dispose material itself
            material.dispose();
        }
    }

    export default Entity;
