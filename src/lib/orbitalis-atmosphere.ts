// Adapted from Orbitalis, Copyright (c) 2026 WinriseF. MIT license: ../app/orbitalis/LICENSE.
import * as THREE from 'three'

export function createAtmosphereMaterial(
	layer: { colorLinear: readonly number[]; power: number; opacity: number; emission: number },
	lightDirection: readonly number[],
	ambient: number
) {
	return new THREE.ShaderMaterial({
		uniforms: {
			tint: { value: new THREE.Color().fromArray(layer.colorLinear).multiplyScalar(layer.emission) },
			power: { value: layer.power }, opacity: { value: layer.opacity },
			sunDirection: { value: new THREE.Vector3().fromArray(lightDirection).normalize() },
			ambient: { value: ambient }
		},
		vertexShader: `varying vec3 worldNormal; varying vec3 worldPosition;
			void main(){ vec4 world = modelMatrix * vec4(position, 1.0); worldPosition = world.xyz;
			worldNormal = normalize(mat3(modelMatrix) * normal); gl_Position = projectionMatrix * viewMatrix * world; }`,
		fragmentShader: `uniform vec3 tint; uniform float power; uniform float opacity;
			uniform vec3 sunDirection; uniform float ambient; varying vec3 worldNormal; varying vec3 worldPosition;
			void main(){ vec3 n = normalize(worldNormal); vec3 v = normalize(cameraPosition - worldPosition);
				float rim = pow(1.0 - clamp(abs(dot(n, v)), 0.0, 1.0), power);
				float light = max(dot(n, sunDirection), 0.0) + ambient;
				gl_FragColor = vec4(tint, clamp(rim * opacity * light, 0.0, 1.0));
				#include <tonemapping_fragment>
				#include <colorspace_fragment>
				}`,
		transparent: true, depthWrite: false, side: THREE.FrontSide
	})
}
