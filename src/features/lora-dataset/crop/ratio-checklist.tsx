import React, { useEffect, useState } from 'react';
import { Box, Text, useInput } from 'ink';

export type RatioChecklistOption = {
	ratio: string;
	count: number;
	selected: boolean;
};

type RatioChecklistProps = {
	options: RatioChecklistOption[];
	onToggle: (ratio: string) => void;
	onSubmit: () => void;
	onCancel: () => void;
};

export function RatioChecklist(props: RatioChecklistProps): React.JSX.Element {
	const [activeIndex, setActiveIndex] = useState(0);

	useEffect(() => {
		setActiveIndex((current) =>
			props.options.length === 0 ? 0 : Math.min(current, props.options.length - 1),
		);
	}, [props.options.length]);

	useInput((input, key) => {
		if (props.options.length === 0) {
			if (key.escape) {
				props.onCancel();
			}
			return;
		}

		if (key.upArrow) {
			setActiveIndex((current) =>
				current === 0 ? props.options.length - 1 : current - 1,
			);
			return;
		}

		if (key.downArrow) {
			setActiveIndex((current) =>
				current === props.options.length - 1 ? 0 : current + 1,
			);
			return;
		}

		if (input === ' ') {
			props.onToggle(props.options[activeIndex]?.ratio ?? '');
			return;
		}

		if (key.return) {
			props.onSubmit();
			return;
		}

		if (key.escape) {
			props.onCancel();
		}
	});

	return (
		<Box flexDirection="column">
			{props.options.map((option, index) => {
				const isActive = index === activeIndex;
				return (
					<Text key={option.ratio} color={isActive ? 'cyanBright' : undefined}>
						{isActive ? '>' : ' '} [{option.selected ? 'x' : ' '}] {option.ratio} (
						{option.count})
					</Text>
				);
			})}
		</Box>
	);
}
