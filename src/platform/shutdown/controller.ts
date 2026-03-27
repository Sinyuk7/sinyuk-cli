type ShutdownController = {
	readonly signal: AbortSignal;
	abort: (reason?: string) => void;
	dispose: () => void;
};

/**
"""Create a process-level SIGINT bridge backed by AbortController.

INTENT: 将 Ctrl+C 转换为可传播的 AbortSignal，供 feature 安全停止副作用
INPUT: None
OUTPUT: ShutdownController
SIDE EFFECT: 注册/解绑 process SIGINT 监听
FAILURE: 无显式失败；重复 abort 会被忽略
"""
 */
export function createShutdownController(): ShutdownController {
	const controller = new AbortController();

	const onSigint = (): void => {
		if (!controller.signal.aborted) {
			controller.abort(new Error('SIGINT'));
		}
	};

	process.on('SIGINT', onSigint);

	return {
		signal: controller.signal,
		abort(reason) {
			if (!controller.signal.aborted) {
				controller.abort(new Error(reason ?? 'ABORTED'));
			}
		},
		dispose() {
			process.off('SIGINT', onSigint);
		},
	};
}
