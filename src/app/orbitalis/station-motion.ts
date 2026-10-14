// Adapted from Orbitalis, Copyright (c) 2026 WinriseF. MIT license: ./LICENSE.
import * as THREE from 'three'
import type { LunarPose } from './lunar-scene'

export type PlanetStationVector3 = readonly [number, number, number]
export type PlanetStationQuaternion = readonly [number, number, number, number]
type Transform = { position: PlanetStationVector3; quaternion: PlanetStationQuaternion; scale: PlanetStationVector3 }
export interface PlanetStationMotionManifest {
	coordinateSystem: 'three-y-up'
	planet: Transform & { prototype: string }
	station: Transform & {
		rotor: { nodeName: string; axis: PlanetStationVector3; radiansPerSecond: number }
		motion: { orbit: { normal: PlanetStationVector3; radiansPerSecond: number } }
	}
}
export interface PlanetStationMotion {
	root: THREE.Group
	planet: THREE.Group
	station: THREE.Group
	rotor: THREE.Object3D
	apply: (pose: LunarPose) => void
	dispose: () => void
}

export function createPlanetStationMotion(manifest: PlanetStationMotionManifest, prototype: THREE.Mesh, stationRoot: THREE.Object3D): PlanetStationMotion {
	const center = new THREE.Vector3().fromArray(manifest.planet.position)
	const origin = new THREE.Vector3().fromArray(manifest.station.position).sub(center)
	const attitude = new THREE.Quaternion().fromArray(manifest.station.quaternion)
	const normal = new THREE.Vector3().fromArray(manifest.station.motion.orbit.normal).normalize()
	const revolution = new THREE.Quaternion()
	const frame = new THREE.Quaternion()
	const rotor = stationRoot.getObjectByName(manifest.station.rotor.nodeName)
	if (!rotor) throw new Error('Missing independent station rotor')
	const rotorAttitude = rotor.quaternion.clone()
	const rotorAxis = new THREE.Vector3().fromArray(manifest.station.rotor.axis).normalize()
	const rotorSpin = new THREE.Quaternion()
	const root = new THREE.Group()
	const planet = new THREE.Group()
	planet.position.copy(center)
	prototype.position.set(0, 0, 0)
	prototype.quaternion.fromArray(manifest.planet.quaternion)
	prototype.scale.fromArray(manifest.planet.scale)
	prototype.updateMatrix()
	planet.add(prototype)
	const station = new THREE.Group()
	station.scale.fromArray(manifest.station.scale)
	station.add(stationRoot)
	root.add(planet, station)
	const apply = ({ yaw, pitch, orbit, stationOrbit = orbit, stationFrame }: LunarPose) => {
		planet.rotation.set(pitch, yaw, 0)
		if (stationFrame) frame.fromArray(stationFrame)
		else frame.identity()
		// The controller's clock advances at 0.24/s; preserve the authored orbital and rotor speeds.
		revolution.setFromAxisAngle(normal, stationOrbit / 0.24 * manifest.station.motion.orbit.radiansPerSecond)
		station.position.copy(origin).applyQuaternion(revolution).applyQuaternion(frame).add(center)
		station.quaternion.copy(frame).multiply(revolution).multiply(attitude)
		rotorSpin.setFromAxisAngle(rotorAxis, orbit / 0.24 * manifest.station.rotor.radiansPerSecond)
		rotor.quaternion.copy(rotorAttitude).multiply(rotorSpin)
		rotor.updateMatrix()
	}
	apply({ yaw: 0, pitch: 0, orbit: 0 })
	return { root, planet, station, rotor, apply, dispose: () => { root.visible = false } }
}
