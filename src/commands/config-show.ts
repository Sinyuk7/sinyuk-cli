import { Command } from 'clipanion';
import { stringify } from 'yaml';

import { getCommandCwd, type SinyukCliContext } from '../cli/context.js';
import { loadResolvedConfig } from '../platform/config/load-config.js';

/**
"""Render resolved config and source paths in a plain-text output.

INTENT: 输出当前生效配置与来源路径，便于排查配置合并结果
INPUT: Command context cwd
OUTPUT: stdout text report
SIDE EFFECT: 读取全局/项目 YAML 配置文件
FAILURE: 配置缺失、YAML 解析失败或校验失败时抛出 ConfigError
"""
 */
export class ConfigShowCommand extends Command<SinyukCliContext> {
	static override paths = [['config', 'show']];

	static override usage = Command.Usage({
		category: 'Config',
		description: 'Show resolved merged configuration',
		examples: [['Show merged config', '$0 config show']],
	});

	override async execute(): Promise<number> {
		const cwd = getCommandCwd(this.context);
		const loaded = loadResolvedConfig({ cwd });
		const mergedConfigYaml = stringify(loaded.config);
		const projectStatus = loaded.projectLoaded ? 'Loaded' : 'Not Found';

		this.context.stdout.write('Config Sources\n');
		this.context.stdout.write(`- Global: ${loaded.globalPath} (Loaded)\n`);
		this.context.stdout.write(`- Project: ${loaded.projectPath} (${projectStatus})\n\n`);
		this.context.stdout.write('Resolved Config (YAML)\n');
		this.context.stdout.write(mergedConfigYaml);

		return 0;
	}
}
