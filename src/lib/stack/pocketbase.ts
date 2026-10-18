import PocketBase from 'pocketbase'

const POCKETBASE_URL = process.env.NEXT_PUBLIC_POCKETBASE_URL || 'https://pb.winrisef.top'

let client: PocketBase | null = null

export function getStackPocketBase() {
	if (!client) client = new PocketBase(POCKETBASE_URL)
	return client
}
