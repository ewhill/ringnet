
/**
 * Abstract base class representing a chat command, such as "/self".
 */
class Command {
	/*
	 * The string used when triggering the command, such as "self".
	 */
	_command;

	/*
	 * Optional help text that is printed out whenever the "/help" command is 
	 * used in combination with this command, such as "/help self".
	 */
	_helpText;

	constructor(command, helpText) {
		this._command = command;
		this._helpText = helpText;
	}

	set command(command) {
		if(!helpText || typeof helpText !== 'string') {
			throw new Error(`Invalid value for property 'helpText'!`);
		}
		this._command = command;
	}

	set helpText(helpText) {
		if(!helpText || typeof helpText !== 'string') {
			throw new Error(`Invalid value for property 'helpText'!`);
		}
		this._helpText = helpText;
	}

	get command() {
		return this._command;
	}

	get helpText() {
		return this._helpText;
	}

	async execute() {
		throw new Error(`'execute()' not implemented!`);
	}
}

module.exports = { Command };