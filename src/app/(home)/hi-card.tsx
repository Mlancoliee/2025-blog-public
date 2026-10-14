import { useCenterStore } from '@/hooks/use-center'
import Card from '@/components/card'
import { useConfigStore } from './stores/config-store'
import AnimatedCore from './animated-core'

function getGreeting() {
	const hour = new Date().getHours()

	if (hour >= 6 && hour < 12) {
		return 'Good Morning'
	} else if (hour >= 12 && hour < 18) {
		return 'Good Afternoon'
	} else if (hour >= 18 && hour < 22) {
		return 'Good Evening'
	} else {
		return 'Good Night'
	}
}

export default function HiCard() {
	const center = useCenterStore()
	const { cardStyles, siteContent } = useConfigStore()
	const greeting = getGreeting()
	const styles = cardStyles.hiCard
	const username = siteContent.meta.title || 'My Blog'

	const x = styles.offsetX !== null ? center.x + styles.offsetX : center.x - styles.width / 2
	const y = styles.offsetY !== null ? center.y + styles.offsetY : center.y - styles.height / 2

	return (
		<Card
			order={styles.order}
			width={styles.width}
			height={styles.height}
			x={x}
			y={y}
			className='core-card relative overflow-hidden p-0 text-center text-primary max-sm:static max-sm:translate-0'>
			<AnimatedCore className='absolute inset-0 h-full w-full rounded-[40px]' />
			<div className='pointer-events-none absolute inset-0 bg-[linear-gradient(180deg,transparent_62%,var(--color-card)_100%)]' />
			<div className='pointer-events-none absolute inset-x-8 top-4 h-px bg-linear-to-r from-transparent via-border to-transparent' />
			<div className='pointer-events-none absolute top-10 bottom-10 left-4 w-px bg-linear-to-b from-transparent via-brand/24 to-transparent' />
			<div className='pointer-events-none absolute top-10 right-4 bottom-10 w-px bg-linear-to-b from-transparent via-brand-secondary/22 to-transparent' />
			<div className='pointer-events-none absolute top-4 left-1/2 z-20 flex -translate-x-1/2 items-center gap-2 text-[10px] font-semibold tracking-[0.24em] whitespace-nowrap text-brand uppercase'>
				<span className='h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_12px_var(--color-brand)]' />
				WinriseF Core
			</div>
			<div className='pointer-events-none absolute right-6 bottom-5 left-6 z-20'>
				<h1 className='font-averia text-2xl leading-none text-primary drop-shadow-[0_1px_4px_var(--color-bg)]'>{greeting}</h1>
				<div className='mt-2 flex items-center justify-center gap-2 text-sm font-medium text-secondary'>
					<span className='text-linear text-[22px] leading-none'>{username}</span>
					<span className='h-1.5 w-1.5 rounded-full bg-brand shadow-[0_0_12px_var(--color-brand)]' />
					<span>System Online</span>
				</div>
			</div>
			<div className='pointer-events-none absolute right-10 bottom-4 left-10 z-20 flex justify-center gap-2'>
				<span className='h-1 w-8 rounded-full bg-brand/54 shadow-[0_0_14px_var(--color-brand)]' />
				<span className='h-1 w-2 rounded-full bg-primary/20' />
				<span className='h-1 w-4 rounded-full bg-brand-secondary/42' />
			</div>
		</Card>
	)
}
