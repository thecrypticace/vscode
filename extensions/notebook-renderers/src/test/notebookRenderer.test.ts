/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import * as assert from 'assert';
import { activate } from '..';
import { OutputItem, RendererApi } from 'vscode-notebook-renderer';
import { IRichRenderContext, RenderOptions } from '../rendererTypes';
import { JSDOM } from "jsdom";

const dom = new JSDOM();
global.document = dom.window.document;

suite('Notebook builtin output renderer', () => {

	const error = {
		name: "NameError",
		message: "name 'x' is not defined",
		stack: "\u001b[1;31m---------------------------------------------------------------------------\u001b[0m" +
			"\n\u001b[1;31mNameError\u001b[0m                                 Traceback (most recent call last)" +
			"\nCell \u001b[1;32mIn[3], line 1\u001b[0m" +
			"\n\u001b[1;32m----> 1\u001b[0m \u001b[39mprint\u001b[39m(x)" +
			"\n\n\u001b[1;31mNameError\u001b[0m: name 'x' is not defined"
	};

	const errorMimeType = 'application/vnd.code.notebook.error';

	const stdoutMimeType = 'application/vnd.code.notebook.stdout';
	const stderrMimeType = 'application/vnd.code.notebook.stderr';

	const textLikeMimeTypes = [
		stdoutMimeType,
		stderrMimeType,
		'text/plain'
	];

	type optionalRenderOptions = { [k in keyof RenderOptions]?: RenderOptions[k] };

	function createContext(settings?: optionalRenderOptions): IRichRenderContext {
		return {
			setState(_value: void) { },
			getState() { return undefined; },
			async getRenderer(_id): Promise<RendererApi | undefined> { return undefined; },
			settings: {
				outputWordWrap: true,
				outputScrolling: true,
				lineLimit: 30,
				...settings
			} as RenderOptions,
			onDidChangeSettings<T>(_listener: (e: T) => any, _thisArgs?: any, _disposables?: any) {
				return {
					dispose(): void { }
				};
			},
			workspace: {
				isTrusted: true
			}
		};
	}

	function createElement(elementType: 'div' | 'span', classes: string[]) {
		const el = global.document.createElement(elementType);
		classes.forEach((c) => el.classList.add(c));
		return el;
	}

	// Helper to generate HTML similar to what is passed to the renderer
	// <div class="cell_container" >
	//   <div class="output_container" >
	//     <div class="output" >
	class OutputHtml {
		private readonly cell = createElement('div', ['cell_container']);
		private readonly firstOutput: HTMLElement;

		constructor() {
			const outputContainer = createElement('div', ['output_container']);
			const outputElement = createElement('div', ['output']);

			this.cell.appendChild(outputContainer);
			outputContainer.appendChild(outputElement);

			this.firstOutput = outputElement;
		}

		public getFirstOuputElement() {
			return this.firstOutput;
		}

		public appendOutputElement() {
			const outputElement = createElement('div', ['output']);
			const outputContainer = createElement('div', ['output_container']);
			this.cell.appendChild(outputContainer);
			outputContainer.appendChild(outputElement);

			return outputElement;
		}
	}

	function createOutputItem(text: string, mime: string, id: string = '123'): OutputItem {
		return {
			id: id,
			mime: mime,
			text() {
				return text;
			},
			blob() {
				return [] as any;
			},
			json() {
				return '{ }';
			},
			data() {
				return [] as any;
			},
			metadata: {}
		};
	}

	textLikeMimeTypes.forEach((mimeType) => {
		test(`Render with wordwrap and scrolling for mimetype ${mimeType}`, async () => {
			const context = createContext({ outputWordWrap: true, outputScrolling: true });
			const renderer = await activate(context);
			assert.ok(renderer, 'Renderer not created');

			const outputElement = new OutputHtml().getFirstOuputElement();
			const outputItem = createOutputItem('content', mimeType);
			renderer!.renderOutputItem(outputItem, outputElement);

			const inserted = outputElement.firstChild as HTMLElement;
			assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
			assert.ok(outputElement.classList.contains('remove-padding'), `Padding should be removed for scrollable outputs ${outputElement.classList}`);
			assert.ok(inserted.classList.contains('word-wrap') && inserted.classList.contains('scrollable'),
				`output content classList should contain word-wrap and scrollable ${inserted.classList}`);
			assert.ok(inserted.innerHTML.indexOf('>content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		});

		test(`Render without wordwrap or scrolling for mimetype ${mimeType}`, async () => {
			const context = createContext({ outputWordWrap: false, outputScrolling: false });
			const renderer = await activate(context);
			assert.ok(renderer, 'Renderer not created');

			const outputElement = new OutputHtml().getFirstOuputElement();
			const outputItem = createOutputItem('content', mimeType);
			renderer!.renderOutputItem(outputItem, outputElement);

			const inserted = outputElement.firstChild as HTMLElement;
			assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
			assert.ok(!outputElement.classList.contains('remove-padding'), `Padding should not be removed for non-scrollable outputs: ${outputElement.classList}`);
			assert.ok(!inserted.classList.contains('word-wrap') && !inserted.classList.contains('scrollable'),
				`output content classList should not contain word-wrap and scrollable ${inserted.classList}`);
			assert.ok(inserted.innerHTML.indexOf('>content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		});

		test(`Replace content in element for mimetype ${mimeType}`, async () => {
			const context = createContext();
			const renderer = await activate(context);
			assert.ok(renderer, 'Renderer not created');

			const outputElement = new OutputHtml().getFirstOuputElement();
			const outputItem = createOutputItem('content', 'text/plain');
			renderer!.renderOutputItem(outputItem, outputElement);
			const outputItem2 = createOutputItem('replaced content', 'text/plain');
			renderer!.renderOutputItem(outputItem2, outputElement);

			const inserted = outputElement.firstChild as HTMLElement;
			assert.ok(inserted.innerHTML.indexOf('>content</') === -1, `Old content was not removed to output element: ${outputElement.innerHTML}`);
			assert.ok(inserted.innerHTML.indexOf('>replaced content</') !== -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		});

	});

	test(`Render with wordwrap and scrolling for error output`, async () => {
		const context = createContext({ outputWordWrap: true, outputScrolling: true });
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem(JSON.stringify(error), errorMimeType);
		renderer!.renderOutputItem(outputItem, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(outputElement.classList.contains('remove-padding'), 'Padding should be removed for scrollable outputs');
		assert.ok(inserted.classList.contains('word-wrap') && inserted.classList.contains('scrollable'),
			`output content classList should contain word-wrap and scrollable ${inserted.classList}`);
		assert.ok(inserted.innerHTML.indexOf('>: name \'x\' is not defined</') > -1, `Content was not added to output element:\n ${outputElement.innerHTML}`);
	});

	test(`Replace content in element for error output`, async () => {
		const context = createContext();
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputElement = new OutputHtml().getFirstOuputElement();
		const outputItem = createOutputItem(JSON.stringify(error), errorMimeType);
		await renderer!.renderOutputItem(outputItem, outputElement);
		const error2: typeof error = { ...error, message: 'new message', stack: 'replaced content' };
		const outputItem2 = createOutputItem(JSON.stringify(error2), errorMimeType);
		await renderer!.renderOutputItem(outputItem2, outputElement);

		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted.innerHTML.indexOf('>: name \'x\' is not defined</') === -1, `Content was not removed from output element:\n ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>replaced content</') !== -1, `Content was not added to output element:\n ${outputElement.innerHTML}`);
	});

	test(`Multiple adjacent streaming outputs should be consolidated one element`, async () => {
		const context = createContext();
		const renderer = await activate(context);
		assert.ok(renderer, 'Renderer not created');

		const outputHtml = new OutputHtml();
		const outputElement = outputHtml.getFirstOuputElement();
		const outputItem1 = createOutputItem('first stream content', stdoutMimeType, '1');
		const outputItem2 = createOutputItem('second stream content', stdoutMimeType, '2');
		const outputItem3 = createOutputItem('third stream content', stderrMimeType, '3');
		renderer!.renderOutputItem(outputItem1, outputElement);
		renderer!.renderOutputItem(outputItem2, outputHtml.appendOutputElement());
		renderer!.renderOutputItem(outputItem3, outputHtml.appendOutputElement());


		const inserted = outputElement.firstChild as HTMLElement;
		assert.ok(inserted, `nothing appended to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>first stream content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>second stream content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
		assert.ok(inserted.innerHTML.indexOf('>third stream content</') > -1, `Content was not added to output element: ${outputElement.innerHTML}`);
	});
});

