var app = (function () {
    'use strict';

    function noop() { }
    const identity = x => x;
    function assign(tar, src) {
        // @ts-ignore
        for (const k in src)
            tar[k] = src[k];
        return tar;
    }
    function add_location(element, file, line, column, char) {
        element.__svelte_meta = {
            loc: { file, line, column, char }
        };
    }
    function run(fn) {
        return fn();
    }
    function blank_object() {
        return Object.create(null);
    }
    function run_all(fns) {
        fns.forEach(run);
    }
    function is_function(thing) {
        return typeof thing === 'function';
    }
    function safe_not_equal(a, b) {
        return a != a ? b == b : a !== b || ((a && typeof a === 'object') || typeof a === 'function');
    }
    function create_slot(definition, ctx, $$scope, fn) {
        if (definition) {
            const slot_ctx = get_slot_context(definition, ctx, $$scope, fn);
            return definition[0](slot_ctx);
        }
    }
    function get_slot_context(definition, ctx, $$scope, fn) {
        return definition[1] && fn
            ? assign($$scope.ctx.slice(), definition[1](fn(ctx)))
            : $$scope.ctx;
    }
    function get_slot_changes(definition, $$scope, dirty, fn) {
        if (definition[2] && fn) {
            const lets = definition[2](fn(dirty));
            if ($$scope.dirty === undefined) {
                return lets;
            }
            if (typeof lets === 'object') {
                const merged = [];
                const len = Math.max($$scope.dirty.length, lets.length);
                for (let i = 0; i < len; i += 1) {
                    merged[i] = $$scope.dirty[i] | lets[i];
                }
                return merged;
            }
            return $$scope.dirty | lets;
        }
        return $$scope.dirty;
    }
    function update_slot(slot, slot_definition, ctx, $$scope, dirty, get_slot_changes_fn, get_slot_context_fn) {
        const slot_changes = get_slot_changes(slot_definition, $$scope, dirty, get_slot_changes_fn);
        if (slot_changes) {
            const slot_context = get_slot_context(slot_definition, ctx, $$scope, get_slot_context_fn);
            slot.p(slot_context, slot_changes);
        }
    }

    const is_client = typeof window !== 'undefined';
    let now = is_client
        ? () => window.performance.now()
        : () => Date.now();
    let raf = is_client ? cb => requestAnimationFrame(cb) : noop;

    const tasks = new Set();
    function run_tasks(now) {
        tasks.forEach(task => {
            if (!task.c(now)) {
                tasks.delete(task);
                task.f();
            }
        });
        if (tasks.size !== 0)
            raf(run_tasks);
    }
    /**
     * Creates a new task that runs on each raf frame
     * until it returns a falsy value or is aborted
     */
    function loop(callback) {
        let task;
        if (tasks.size === 0)
            raf(run_tasks);
        return {
            promise: new Promise(fulfill => {
                tasks.add(task = { c: callback, f: fulfill });
            }),
            abort() {
                tasks.delete(task);
            }
        };
    }

    function append(target, node) {
        target.appendChild(node);
    }
    function insert(target, node, anchor) {
        target.insertBefore(node, anchor || null);
    }
    function detach(node) {
        node.parentNode.removeChild(node);
    }
    function destroy_each(iterations, detaching) {
        for (let i = 0; i < iterations.length; i += 1) {
            if (iterations[i])
                iterations[i].d(detaching);
        }
    }
    function element(name) {
        return document.createElement(name);
    }
    function svg_element(name) {
        return document.createElementNS('http://www.w3.org/2000/svg', name);
    }
    function text(data) {
        return document.createTextNode(data);
    }
    function space() {
        return text(' ');
    }
    function empty() {
        return text('');
    }
    function listen(node, event, handler, options) {
        node.addEventListener(event, handler, options);
        return () => node.removeEventListener(event, handler, options);
    }
    function attr(node, attribute, value) {
        if (value == null)
            node.removeAttribute(attribute);
        else if (node.getAttribute(attribute) !== value)
            node.setAttribute(attribute, value);
    }
    function children(element) {
        return Array.from(element.childNodes);
    }
    function set_input_value(input, value) {
        input.value = value == null ? '' : value;
    }
    function custom_event(type, detail) {
        const e = document.createEvent('CustomEvent');
        e.initCustomEvent(type, false, false, detail);
        return e;
    }

    const active_docs = new Set();
    let active = 0;
    // https://github.com/darkskyapp/string-hash/blob/master/index.js
    function hash(str) {
        let hash = 5381;
        let i = str.length;
        while (i--)
            hash = ((hash << 5) - hash) ^ str.charCodeAt(i);
        return hash >>> 0;
    }
    function create_rule(node, a, b, duration, delay, ease, fn, uid = 0) {
        const step = 16.666 / duration;
        let keyframes = '{\n';
        for (let p = 0; p <= 1; p += step) {
            const t = a + (b - a) * ease(p);
            keyframes += p * 100 + `%{${fn(t, 1 - t)}}\n`;
        }
        const rule = keyframes + `100% {${fn(b, 1 - b)}}\n}`;
        const name = `__svelte_${hash(rule)}_${uid}`;
        const doc = node.ownerDocument;
        active_docs.add(doc);
        const stylesheet = doc.__svelte_stylesheet || (doc.__svelte_stylesheet = doc.head.appendChild(element('style')).sheet);
        const current_rules = doc.__svelte_rules || (doc.__svelte_rules = {});
        if (!current_rules[name]) {
            current_rules[name] = true;
            stylesheet.insertRule(`@keyframes ${name} ${rule}`, stylesheet.cssRules.length);
        }
        const animation = node.style.animation || '';
        node.style.animation = `${animation ? `${animation}, ` : ``}${name} ${duration}ms linear ${delay}ms 1 both`;
        active += 1;
        return name;
    }
    function delete_rule(node, name) {
        const previous = (node.style.animation || '').split(', ');
        const next = previous.filter(name
            ? anim => anim.indexOf(name) < 0 // remove specific animation
            : anim => anim.indexOf('__svelte') === -1 // remove all Svelte animations
        );
        const deleted = previous.length - next.length;
        if (deleted) {
            node.style.animation = next.join(', ');
            active -= deleted;
            if (!active)
                clear_rules();
        }
    }
    function clear_rules() {
        raf(() => {
            if (active)
                return;
            active_docs.forEach(doc => {
                const stylesheet = doc.__svelte_stylesheet;
                let i = stylesheet.cssRules.length;
                while (i--)
                    stylesheet.deleteRule(i);
                doc.__svelte_rules = {};
            });
            active_docs.clear();
        });
    }

    let current_component;
    function set_current_component(component) {
        current_component = component;
    }
    function get_current_component() {
        if (!current_component)
            throw new Error(`Function called outside component initialization`);
        return current_component;
    }
    function onMount(fn) {
        get_current_component().$$.on_mount.push(fn);
    }
    function createEventDispatcher() {
        const component = get_current_component();
        return (type, detail) => {
            const callbacks = component.$$.callbacks[type];
            if (callbacks) {
                // TODO are there situations where events could be dispatched
                // in a server (non-DOM) environment?
                const event = custom_event(type, detail);
                callbacks.slice().forEach(fn => {
                    fn.call(component, event);
                });
            }
        };
    }

    const dirty_components = [];
    const binding_callbacks = [];
    const render_callbacks = [];
    const flush_callbacks = [];
    const resolved_promise = Promise.resolve();
    let update_scheduled = false;
    function schedule_update() {
        if (!update_scheduled) {
            update_scheduled = true;
            resolved_promise.then(flush);
        }
    }
    function add_render_callback(fn) {
        render_callbacks.push(fn);
    }
    function add_flush_callback(fn) {
        flush_callbacks.push(fn);
    }
    let flushing = false;
    const seen_callbacks = new Set();
    function flush() {
        if (flushing)
            return;
        flushing = true;
        do {
            // first, call beforeUpdate functions
            // and update components
            for (let i = 0; i < dirty_components.length; i += 1) {
                const component = dirty_components[i];
                set_current_component(component);
                update(component.$$);
            }
            dirty_components.length = 0;
            while (binding_callbacks.length)
                binding_callbacks.pop()();
            // then, once components are updated, call
            // afterUpdate functions. This may cause
            // subsequent updates...
            for (let i = 0; i < render_callbacks.length; i += 1) {
                const callback = render_callbacks[i];
                if (!seen_callbacks.has(callback)) {
                    // ...so guard against infinite loops
                    seen_callbacks.add(callback);
                    callback();
                }
            }
            render_callbacks.length = 0;
        } while (dirty_components.length);
        while (flush_callbacks.length) {
            flush_callbacks.pop()();
        }
        update_scheduled = false;
        flushing = false;
        seen_callbacks.clear();
    }
    function update($$) {
        if ($$.fragment !== null) {
            $$.update();
            run_all($$.before_update);
            const dirty = $$.dirty;
            $$.dirty = [-1];
            $$.fragment && $$.fragment.p($$.ctx, dirty);
            $$.after_update.forEach(add_render_callback);
        }
    }

    let promise;
    function wait() {
        if (!promise) {
            promise = Promise.resolve();
            promise.then(() => {
                promise = null;
            });
        }
        return promise;
    }
    function dispatch(node, direction, kind) {
        node.dispatchEvent(custom_event(`${direction ? 'intro' : 'outro'}${kind}`));
    }
    const outroing = new Set();
    let outros;
    function group_outros() {
        outros = {
            r: 0,
            c: [],
            p: outros // parent group
        };
    }
    function check_outros() {
        if (!outros.r) {
            run_all(outros.c);
        }
        outros = outros.p;
    }
    function transition_in(block, local) {
        if (block && block.i) {
            outroing.delete(block);
            block.i(local);
        }
    }
    function transition_out(block, local, detach, callback) {
        if (block && block.o) {
            if (outroing.has(block))
                return;
            outroing.add(block);
            outros.c.push(() => {
                outroing.delete(block);
                if (callback) {
                    if (detach)
                        block.d(1);
                    callback();
                }
            });
            block.o(local);
        }
    }
    const null_transition = { duration: 0 };
    function create_bidirectional_transition(node, fn, params, intro) {
        let config = fn(node, params);
        let t = intro ? 0 : 1;
        let running_program = null;
        let pending_program = null;
        let animation_name = null;
        function clear_animation() {
            if (animation_name)
                delete_rule(node, animation_name);
        }
        function init(program, duration) {
            const d = program.b - t;
            duration *= Math.abs(d);
            return {
                a: t,
                b: program.b,
                d,
                duration,
                start: program.start,
                end: program.start + duration,
                group: program.group
            };
        }
        function go(b) {
            const { delay = 0, duration = 300, easing = identity, tick = noop, css } = config || null_transition;
            const program = {
                start: now() + delay,
                b
            };
            if (!b) {
                // @ts-ignore todo: improve typings
                program.group = outros;
                outros.r += 1;
            }
            if (running_program) {
                pending_program = program;
            }
            else {
                // if this is an intro, and there's a delay, we need to do
                // an initial tick and/or apply CSS animation immediately
                if (css) {
                    clear_animation();
                    animation_name = create_rule(node, t, b, duration, delay, easing, css);
                }
                if (b)
                    tick(0, 1);
                running_program = init(program, duration);
                add_render_callback(() => dispatch(node, b, 'start'));
                loop(now => {
                    if (pending_program && now > pending_program.start) {
                        running_program = init(pending_program, duration);
                        pending_program = null;
                        dispatch(node, running_program.b, 'start');
                        if (css) {
                            clear_animation();
                            animation_name = create_rule(node, t, running_program.b, running_program.duration, 0, easing, config.css);
                        }
                    }
                    if (running_program) {
                        if (now >= running_program.end) {
                            tick(t = running_program.b, 1 - t);
                            dispatch(node, running_program.b, 'end');
                            if (!pending_program) {
                                // we're done
                                if (running_program.b) {
                                    // intro — we can tidy up immediately
                                    clear_animation();
                                }
                                else {
                                    // outro — needs to be coordinated
                                    if (!--running_program.group.r)
                                        run_all(running_program.group.c);
                                }
                            }
                            running_program = null;
                        }
                        else if (now >= running_program.start) {
                            const p = now - running_program.start;
                            t = running_program.a + running_program.d * easing(p / running_program.duration);
                            tick(t, 1 - t);
                        }
                    }
                    return !!(running_program || pending_program);
                });
            }
        }
        return {
            run(b) {
                if (is_function(config)) {
                    wait().then(() => {
                        // @ts-ignore
                        config = config();
                        go(b);
                    });
                }
                else {
                    go(b);
                }
            },
            end() {
                clear_animation();
                running_program = pending_program = null;
            }
        };
    }

    function bind(component, name, callback) {
        const index = component.$$.props[name];
        if (index !== undefined) {
            component.$$.bound[index] = callback;
            callback(component.$$.ctx[index]);
        }
    }
    function create_component(block) {
        block && block.c();
    }
    function mount_component(component, target, anchor) {
        const { fragment, on_mount, on_destroy, after_update } = component.$$;
        fragment && fragment.m(target, anchor);
        // onMount happens before the initial afterUpdate
        add_render_callback(() => {
            const new_on_destroy = on_mount.map(run).filter(is_function);
            if (on_destroy) {
                on_destroy.push(...new_on_destroy);
            }
            else {
                // Edge case - component was destroyed immediately,
                // most likely as a result of a binding initialising
                run_all(new_on_destroy);
            }
            component.$$.on_mount = [];
        });
        after_update.forEach(add_render_callback);
    }
    function destroy_component(component, detaching) {
        const $$ = component.$$;
        if ($$.fragment !== null) {
            run_all($$.on_destroy);
            $$.fragment && $$.fragment.d(detaching);
            // TODO null out other refs, including component.$$ (but need to
            // preserve final state?)
            $$.on_destroy = $$.fragment = null;
            $$.ctx = [];
        }
    }
    function make_dirty(component, i) {
        if (component.$$.dirty[0] === -1) {
            dirty_components.push(component);
            schedule_update();
            component.$$.dirty.fill(0);
        }
        component.$$.dirty[(i / 31) | 0] |= (1 << (i % 31));
    }
    function init(component, options, instance, create_fragment, not_equal, props, dirty = [-1]) {
        const parent_component = current_component;
        set_current_component(component);
        const prop_values = options.props || {};
        const $$ = component.$$ = {
            fragment: null,
            ctx: null,
            // state
            props,
            update: noop,
            not_equal,
            bound: blank_object(),
            // lifecycle
            on_mount: [],
            on_destroy: [],
            before_update: [],
            after_update: [],
            context: new Map(parent_component ? parent_component.$$.context : []),
            // everything else
            callbacks: blank_object(),
            dirty
        };
        let ready = false;
        $$.ctx = instance
            ? instance(component, prop_values, (i, ret, ...rest) => {
                const value = rest.length ? rest[0] : ret;
                if ($$.ctx && not_equal($$.ctx[i], $$.ctx[i] = value)) {
                    if ($$.bound[i])
                        $$.bound[i](value);
                    if (ready)
                        make_dirty(component, i);
                }
                return ret;
            })
            : [];
        $$.update();
        ready = true;
        run_all($$.before_update);
        // `false` as a special case of no DOM component
        $$.fragment = create_fragment ? create_fragment($$.ctx) : false;
        if (options.target) {
            if (options.hydrate) {
                const nodes = children(options.target);
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.l(nodes);
                nodes.forEach(detach);
            }
            else {
                // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
                $$.fragment && $$.fragment.c();
            }
            if (options.intro)
                transition_in(component.$$.fragment);
            mount_component(component, options.target, options.anchor);
            flush();
        }
        set_current_component(parent_component);
    }
    class SvelteComponent {
        $destroy() {
            destroy_component(this, 1);
            this.$destroy = noop;
        }
        $on(type, callback) {
            const callbacks = (this.$$.callbacks[type] || (this.$$.callbacks[type] = []));
            callbacks.push(callback);
            return () => {
                const index = callbacks.indexOf(callback);
                if (index !== -1)
                    callbacks.splice(index, 1);
            };
        }
        $set() {
            // overridden by instance, if it has props
        }
    }

    function dispatch_dev(type, detail) {
        document.dispatchEvent(custom_event(type, Object.assign({ version: '3.24.0' }, detail)));
    }
    function append_dev(target, node) {
        dispatch_dev("SvelteDOMInsert", { target, node });
        append(target, node);
    }
    function insert_dev(target, node, anchor) {
        dispatch_dev("SvelteDOMInsert", { target, node, anchor });
        insert(target, node, anchor);
    }
    function detach_dev(node) {
        dispatch_dev("SvelteDOMRemove", { node });
        detach(node);
    }
    function listen_dev(node, event, handler, options, has_prevent_default, has_stop_propagation) {
        const modifiers = options === true ? ["capture"] : options ? Array.from(Object.keys(options)) : [];
        if (has_prevent_default)
            modifiers.push('preventDefault');
        if (has_stop_propagation)
            modifiers.push('stopPropagation');
        dispatch_dev("SvelteDOMAddEventListener", { node, event, handler, modifiers });
        const dispose = listen(node, event, handler, options);
        return () => {
            dispatch_dev("SvelteDOMRemoveEventListener", { node, event, handler, modifiers });
            dispose();
        };
    }
    function attr_dev(node, attribute, value) {
        attr(node, attribute, value);
        if (value == null)
            dispatch_dev("SvelteDOMRemoveAttribute", { node, attribute });
        else
            dispatch_dev("SvelteDOMSetAttribute", { node, attribute, value });
    }
    function set_data_dev(text, data) {
        data = '' + data;
        if (text.wholeText === data)
            return;
        dispatch_dev("SvelteDOMSetData", { node: text, data });
        text.data = data;
    }
    function validate_each_argument(arg) {
        if (typeof arg !== 'string' && !(arg && typeof arg === 'object' && 'length' in arg)) {
            let msg = '{#each} only iterates over array-like objects.';
            if (typeof Symbol === 'function' && arg && Symbol.iterator in arg) {
                msg += ' You can use a spread to convert this iterable into an array.';
            }
            throw new Error(msg);
        }
    }
    function validate_slots(name, slot, keys) {
        for (const slot_key of Object.keys(slot)) {
            if (!~keys.indexOf(slot_key)) {
                console.warn(`<${name}> received an unexpected slot "${slot_key}".`);
            }
        }
    }
    class SvelteComponentDev extends SvelteComponent {
        constructor(options) {
            if (!options || (!options.target && !options.$$inline)) {
                throw new Error(`'target' is a required option`);
            }
            super();
        }
        $destroy() {
            super.$destroy();
            this.$destroy = () => {
                console.warn(`Component was already destroyed`); // eslint-disable-line no-console
            };
        }
        $capture_state() { }
        $inject_state() { }
    }

    var rulesList = [{
      title: '火车车次',
      rule: /^[GCDZTSPKXLY1-9]\d{1,4}$/,
      examples: ['G1868', 'D102', 'D9', 'Z5', 'Z24', 'Z17']
    },
    {
      title: '手机机身码(IMEI)',
      rule: /^\d{15,17}$/,
      examples: ['123456789012345', '1234567890123456', '12345678901234567']
    },
    {
      title: '必须带端口号的网址(或ip)',
      rule: /^((ht|f)tps?:\/\/)?[\w-]+(\.[\w-]+)+:\d{1,5}\/?$/,
      examples: ['https://www.qq.com:8080', '127.0.0.1:5050', 'baidu.com:8001', 'http://192.168.1.1:9090'],
      counterExamples: ['192.168.1.1', 'https://www.jd.com']
    },
    {
      title: '网址(url,支持端口和"?+参数"和"#+参数)',
      rule: /^(((ht|f)tps?):\/\/)?[\w-]+(\.[\w-]+)+([\w.,@?^=%&:/~+#-]*[\w@?^=%&/~+#-])?$/,
      examples: ['www.qq.com', 'https://baidu.com', '360.com:8080/vue/#/a=1&b=2'],
      counterExamples: ['....']
    },
    {
      title: '统一社会信用代码',
      rule: /^[0-9A-HJ-NPQRTUWXY]{2}\d{6}[0-9A-HJ-NPQRTUWXY]{10}$/,
      examples: ['91230184MA1BUFLT44', '92371000MA3MXH0E3W'],
    },

    {
      title: '迅雷链接',
      rule: /^thunderx?:\/\/[a-zA-Z\d]+=$/,
      examples: ['thunder://QUEsICdtYWduZXQ6P3h0PXVybjpidGloOjBCQTE0RTUxRkUwNjU1RjE0Qzc4NjE4RjY4NDY0QjZFNTEyNjcyOUMnWlo='],
    },

    {
      title: 'ed2k链接(宽松匹配)',
      rule: /^ed2k:\/\/\|file\|.+\|\/$/,
      examples: ['ed2k://|file|%E5%AF%84%E7%94%9F%E8%99%AB.PARASITE.2019.HD-1080p.X264.AAC-UUMp4(ED2000.COM).mp4|2501554832|C0B93E0879C6071CBED732C20CE577A3|h=5HTKZPQFYRKORN52I3M7GQ4QQCIHFIBV|/'],
    },

    {
      title: '磁力链接(宽松匹配)',
      rule: /^magnet:\?xt=urn:btih:[0-9a-fA-F]{40,}.*$/,
      examples: ['magnet:?xt=urn:btih:40A89A6F4FB1498A98087109D012A9A851FBE0FC'],
    },
    {
      title: '子网掩码',
      rule: /^(?:\d{1,2}|1\d\d|2[0-4]\d|25[0-5])(?:\.(?:\d{1,2}|1\d\d|2[0-4]\d|25[0-5])){3}$/,
      examples: ['255.255.255.0', '255.224.0.0']
    },
    {
      title: 'linux"隐藏文件"路径',
      rule: /^\/(?:[^/]+\/)*\.[^/]*/,
      examples: ['/usr/ad/.dd', '/root/.gitignore', '/.gitignore']
    },
    {
      title: 'linux文件夹路径',
      rule: /^\/(?:[^/]+\/)*$/,
      examples: ['/usr/ad/dd/', '/', '/root/']
    },
    {
      title: 'linux文件路径',
      rule: /^\/(?:[^/]+\/)*[^/]+$/,
      examples: ['/root/b.ts', '/root/abc']
    },
    {
      title: 'window"文件夹"路径',
      rule: /^[a-zA-Z]:\\(?:\w+\\?)*$/,
      examples: ['C:\\Users\\Administrator\\Desktop', 'e:\\m\\']
    },
    {
      title: 'window下"文件"路径',
      rule: /^[a-zA-Z]:\\(?:\w+\\)*\w+\.\w+$/,
      examples: ['C:\\Users\\Administrator\\Desktop\\qq.link', 'e:\\m\\vscode.exe']
    },
    {
      title: '股票代码(A股)',
      rule: /^(s[hz]|S[HZ])(000[\d]{3}|002[\d]{3}|300[\d]{3}|600[\d]{3}|60[\d]{4})$/,
      examples: ['sz000858', 'SZ002136', 'sz300675', 'SH600600', 'sh601155']
    },
    {
      title: '大于等于0, 小于等于150, 支持小数位出现5, 如145.5, 用于判断考卷分数',
      rule: /^150$|^(?:\d|[1-9]\d|1[0-4]\d)(?:.5)?$/,
      examples: [150, 100.5]
    },
    {
      title: 'html注释',
      rule: /^<!--[\s\S]*?-->$/,
      examples: ['<!--<div class="_bubble"></div>-->']
    },
    {
      title: 'md5格式(32位)',
      rule: /^([a-f\d]{32}|[A-F\d]{32})$/,
      examples: ['21fe181c5bfc16306a6828c1f7b762e8'],
    },
    {
      title: '版本号(version)格式必须为X.Y.Z',
      rule: /^\d+(?:\.\d+){2}$/,
      examples: ['16.3.10']
    },
    {
      title: '视频(video)链接地址（视频格式可按需增删）',
      rule: /^https?:\/\/(.+\/)+.+(\.(swf|avi|flv|mpg|rm|mov|wav|asf|3gp|mkv|rmvb|mp4))$/i,
      examples: ['http://www.abc.com/video/wc.avi']
    },
    {
      title: '图片(image)链接地址（图片格式可按需增删）',
      rule: /^https?:\/\/(.+\/)+.+(\.(gif|png|jpg|jpeg|webp|svg|psd|bmp|tif))$/i,
      examples: ['https://www.abc.com/logo.png']
    },
    {
      title: '24小时制时间（HH:mm:ss）',
      rule: /^(?:[01]\d|2[0-3]):[0-5]\d:[0-5]\d$/,
      examples: ['23:34:55']
    },
    {
      title: '12小时制时间（hh:mm:ss）',
      rule: /^(?:1[0-2]|0?[1-9]):[0-5]\d:[0-5]\d$/,
      examples: ['11:34:55'],
      counterExamples: ['23:34:55']
    },
    {
      title: 'base64格式',
      rule: /^\s*data:(?:[a-z]+\/[a-z0-9-+.]+(?:;[a-z-]+=[a-z0-9-]+)?)?(?:;base64)?,([a-z0-9!$&',()*+;=\-._~:@/?%\s]*?)\s*$/i,
      examples: ['data:image/gif;base64,xxxx==']
    },
    {
      title: '数字/货币金额（支持负数、千分位分隔符）',
      rule: /^-?\d+(,\d{3})*(\.\d{1,2})?$/,
      examples: [100, -0.99, 3, 234.32, -1, 900, 235.09, '12,345,678.90']
    },
    {
      title: '数字/货币金额 (只支持正数、不支持校验千分位分隔符)',
      rule: /(?:^[1-9]([0-9]+)?(?:\.[0-9]{1,2})?$)|(?:^(?:0){1}$)|(?:^[0-9]\.[0-9](?:[0-9])?$)/,
      examples: [0.99, 8.99, 666]
    },
    {
      title: '银行卡号（10到30位, 覆盖对公/私账户, 参考[微信支付](https://pay.weixin.qq.com/wiki/doc/api/xiaowei.php?chapter=22_1)）',
      rule: /^[1-9]\d{9,29}$/,
      examples: [6234567890, 6222026006705354217]
    },
    {
      title: '中文姓名',
      rule: /^(?:[\u4e00-\u9fa5·]{2,16})$/,
      examples: ['葛二蛋', '凯文·杜兰特', '德克·维尔纳·诺维茨基']
    },
    {
      title: '英文姓名',
      rule: /(^[a-zA-Z]{1}[a-zA-Z\s]{0,20}[a-zA-Z]{1}$)/,
      examples: ['James', 'Kevin Wayne Durant', 'Dirk Nowitzki']
    },
    {
      title: '车牌号(新能源)',
      rule: /[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领 A-Z]{1}[A-HJ-NP-Z]{1}(([0-9]{5}[DF])|([DF][A-HJ-NP-Z0-9][0-9]{4}))$/,
      examples: ['京AD92035', '甘G23459F'],
    },
    {
      title: '车牌号(非新能源)',
      rule: /^[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领 A-Z]{1}[A-HJ-NP-Z]{1}[A-Z0-9]{4}[A-Z0-9挂学警港澳]{1}$/,
      examples: ['京A00599', '黑D23908']
    },
    {
      title: '车牌号(新能源+非新能源)',
      rule: /^(?:[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领 A-Z]{1}[A-HJ-NP-Z]{1}(?:(?:[0-9]{5}[DF])|(?:[DF](?:[A-HJ-NP-Z0-9])[0-9]{4})))$|(?:[京津沪渝冀豫云辽黑湘皖鲁新苏浙赣鄂桂甘晋蒙陕吉闽贵粤青藏川宁琼使领 A-Z]{1}[A-Z]{1}[A-HJ-NP-Z0-9]{4}[A-HJ-NP-Z0-9 挂学警港澳]{1})$/,
      examples: ['京A12345D', '京A00599'],
      counterExamples: ['宁AD1234555555']
    },
    {
      title: '手机号(mobile phone)中国(严谨), 根据工信部2019年最新公布的手机号段',
      rule: /^(?:(?:\+|00)86)?1(?:(?:3[\d])|(?:4[5-7|9])|(?:5[0-3|5-9])|(?:6[5-7])|(?:7[0-8])|(?:8[\d])|(?:9[1|8|9]))\d{8}$/,
      examples: ['008618311006933', '+8617888829981', '19119255642']
    },
    {
      title: '手机号(mobile phone)中国(宽松), 只要是13,14,15,16,17,18,19开头即可',
      rule: /^(?:(?:\+|00)86)?1[3-9]\d{9}$/,
      examples: ['008618311006933', '+8617888829981', '19119255642']
    },
    {
      title: '手机号(mobile phone)中国(最宽松), 只要是1开头即可, 如果你的手机号是用来接收短信, 优先建议选择这一条',
      rule: /^(?:(?:\+|00)86)?1\d{10}$/,
      examples: ['008618311006933', '+8617888829981', '19119255642']
    },
    {
      title: 'date(日期)',
      rule: /^\d{4}(-)(1[0-2]|0?\d)\1([0-2]\d|\d|30|31)$/,
      examples: ['1990-12-12', '2020-1-1']
    },
    {
      title: 'email(邮箱)',
      rule: /^(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))$/,
      examples: ['90203918@qq.com', 'nbilly@126.com']
    },
    {
      title: '座机(tel phone)电话(国内),如: 0341-86091234',
      rule: /^\d{3}-\d{8}$|^\d{4}-\d{7,8}$/,
      examples: ['0936-4211235']
    },
    {
      title: '身份证号(1代,15位数字)',
      rule: /^[1-9]\d{7}(?:0\d|10|11|12)(?:0[1-9]|[1-2][\d]|30|31)\d{3}$/,
      examples: ['123456991010193']
    },
    {
      title: '身份证号(2代,18位数字),最后一位是校验位,可能为数字或字符X',
      rule: /^[1-9]\d{5}(?:18|19|20)\d{2}(?:0[1-9]|10|11|12)(?:0[1-9]|[1-2]\d|30|31)\d{3}[\dXx]$/,
      examples: ['12345619991205131x']
    },
    {
      title: '身份证号, 支持1/2代(15位/18位数字)',
      rule: /(^\d{8}(0\d|10|11|12)([0-2]\d|30|31)\d{3}$)|(^\d{6}(18|19|20)\d{2}(0[1-9]|10|11|12)([0-2]\d|30|31)\d{3}(\d|X|x)$)/,
      examples: ['622223199912051311']
    },
    {
      title: '护照（包含香港、澳门）',
      rule: /(^[EeKkGgDdSsPpHh]\d{8}$)|(^(([Ee][a-fA-F])|([DdSsPp][Ee])|([Kk][Jj])|([Mm][Aa])|(1[45]))\d{7}$)/,
      examples: ['s28233515', '141234567', '159203084', 'MA1234567', 'K25345719']
    },
    {
      title: '帐号是否合法(字母开头，允许5-16字节，允许字母数字下划线组合',
      rule: /^[a-zA-Z]\w{4,15}$/,
      examples: ['justin', 'justin1989', 'justin_666']
    },
    {
      title: '中文/汉字',
      // rule: /^[\u4E00-\u9FA5]+$/,
      rule: /^(?:[\u3400-\u4DB5\u4E00-\u9FEA\uFA0E\uFA0F\uFA11\uFA13\uFA14\uFA1F\uFA21\uFA23\uFA24\uFA27-\uFA29]|[\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0])+$/,
      examples: ['正则', '前端']
    },
    {
      title: '小数',
      rule: /^\d+\.\d+$/,
      examples: ['0.0', '0.09']
    },
    {
      title: '数字',
      rule: /^\d{1,}$/,
      examples: [12345678]
    },
    {
      title: 'html标签(宽松匹配)',
      rule: /<(\w+)[^>]*>(.*?<\/\1>)?/,
      examples: ['<div id="app"> 2333 </div>', '<input type="text">', '<br>']
    },
    {
      title: 'qq号格式正确',
      rule: /^[1-9][0-9]{4,10}$/,
      examples: [903013545, 9020304]
    },
    {
      title: '数字和字母组成',
      rule: /^[A-Za-z0-9]+$/,
      examples: ['james666', 'haha233hi']
    },
    {
      title: '英文字母',
      rule: /^[a-zA-Z]+$/,
      examples: ['Russel']
    },
    {
      title: '小写英文字母组成',
      rule: /^[a-z]+$/,
      examples: ['russel']
    },
    {
      title: '大写英文字母',
      rule: /^[A-Z]+$/,
      examples: ['ABC', 'KD']
    },
    {
      title: '密码强度校验，最少6位，包括至少1个大写字母，1个小写字母，1个数字，1个特殊字符',
      rule: /^\S*(?=\S{6,})(?=\S*\d)(?=\S*[A-Z])(?=\S*[a-z])(?=\S*[!@#$%^&*? ])\S*$/,
      examples: ['Kd@curry666']
    },
    {
      title: '用户名校验，4到16位（字母，数字，下划线，减号）',
      rule: /^[a-zA-Z0-9_-]{4,16}$/,
      examples: ['xiaohua_qq']
    },
    {
      title: 'ip-v4',
      rule: /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/,
      examples: ['172.16.0.0', '127.0.0.0']
    },
    {
      title: 'ip-v6',
      rule: /^((([0-9A-Fa-f]{1,4}:){7}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}:[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){5}:([0-9A-Fa-f]{1,4}:)?[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){4}:([0-9A-Fa-f]{1,4}:){0,2}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){3}:([0-9A-Fa-f]{1,4}:){0,3}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){2}:([0-9A-Fa-f]{1,4}:){0,4}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){6}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(([0-9A-Fa-f]{1,4}:){0,5}:((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|(::([0-9A-Fa-f]{1,4}:){0,5}((\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b)\.){3}(\b((25[0-5])|(1\d{2})|(2[0-4]\d)|(\d{1,2}))\b))|([0-9A-Fa-f]{1,4}::([0-9A-Fa-f]{1,4}:){0,5}[0-9A-Fa-f]{1,4})|(::([0-9A-Fa-f]{1,4}:){0,6}[0-9A-Fa-f]{1,4})|(([0-9A-Fa-f]{1,4}:){1,7}:))$/i,
      examples: ['2031:0000:130f:0000:0000:09c0:876a:130b']
    },
    {
      title: '16进制颜色',
      rule: /^#?([a-fA-F0-9]{6}|[a-fA-F0-9]{3})$/,
      examples: ['#f00', '#F90', '#000', '#fe9de8']
    },
    {
      title: '微信号(wx)，6至20位，以字母开头，字母，数字，减号，下划线',
      rule: /^[a-zA-Z][-_a-zA-Z0-9]{5,19}$/,
      examples: ['github666', 'kd_-666']
    },
    {
      title: '邮政编码(中国)',
      rule: /^(0[1-7]|1[0-356]|2[0-7]|3[0-6]|4[0-7]|5[1-7]|6[1-7]|7[0-5]|8[013-6])\d{4}$/,
      examples: ['734500', '100101']
    },
    {
      title: '中文和数字',
      rule: /^((?:[\u3400-\u4DB5\u4E00-\u9FEA\uFA0E\uFA0F\uFA11\uFA13\uFA14\uFA1F\uFA21\uFA23\uFA24\uFA27-\uFA29]|[\uD840-\uD868\uD86A-\uD86C\uD86F-\uD872\uD874-\uD879][\uDC00-\uDFFF]|\uD869[\uDC00-\uDED6\uDF00-\uDFFF]|\uD86D[\uDC00-\uDF34\uDF40-\uDFFF]|\uD86E[\uDC00-\uDC1D\uDC20-\uDFFF]|\uD873[\uDC00-\uDEA1\uDEB0-\uDFFF]|\uD87A[\uDC00-\uDFE0])|(\d))+$/,
      examples: ['哈哈哈', '你好6啊']
    },
    {
      title: '不能包含字母',
      rule: /^[^A-Za-z]*$/,
      examples: ['你好6啊', '@¥()！']
    },
    {
      title: 'java包名',
      rule: /^([a-zA-Z_][a-zA-Z0-9_]*)+([.][a-zA-Z_][a-zA-Z0-9_]*)+$/,
      examples: ['com.bbb.name']
    },
    {
      title: 'mac地址',
      rule: /^((([a-f0-9]{2}:){5})|(([a-f0-9]{2}-){5}))[a-f0-9]{2}$/i,
      examples: ['38:f9:d3:4b:f5:51', '00-0C-29-CA-E4-66']
    },
    {
      title: '匹配连续重复的字符',
      rule: /(.)\1+/,
      examples: ['我我我', '112233', '11234']
    }
    ];

    /* components\Container.svelte generated by Svelte v3.24.0 */

    const file = "components\\Container.svelte";

    function create_fragment(ctx) {
    	let div;
    	let div_class_value;
    	let current;
    	const default_slot_template = /*$$slots*/ ctx[2].default;
    	const default_slot = create_slot(default_slot_template, ctx, /*$$scope*/ ctx[1], null);

    	const block = {
    		c: function create() {
    			div = element("div");
    			if (default_slot) default_slot.c();
    			attr_dev(div, "class", div_class_value = "container mx-auto px-4 md:px-24 " + /*className*/ ctx[0]);
    			add_location(div, file, 4, 0, 52);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);

    			if (default_slot) {
    				default_slot.m(div, null);
    			}

    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (default_slot) {
    				if (default_slot.p && dirty & /*$$scope*/ 2) {
    					update_slot(default_slot, default_slot_template, ctx, /*$$scope*/ ctx[1], dirty, null, null);
    				}
    			}

    			if (!current || dirty & /*className*/ 1 && div_class_value !== (div_class_value = "container mx-auto px-4 md:px-24 " + /*className*/ ctx[0])) {
    				attr_dev(div, "class", div_class_value);
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(default_slot, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(default_slot, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (default_slot) default_slot.d(detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance($$self, $$props, $$invalidate) {
    	let { className = "" } = $$props;
    	const writable_props = ["className"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Container> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Container", $$slots, ['default']);

    	$$self.$set = $$props => {
    		if ("className" in $$props) $$invalidate(0, className = $$props.className);
    		if ("$$scope" in $$props) $$invalidate(1, $$scope = $$props.$$scope);
    	};

    	$$self.$capture_state = () => ({ className });

    	$$self.$inject_state = $$props => {
    		if ("className" in $$props) $$invalidate(0, className = $$props.className);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [className, $$scope, $$slots];
    }

    class Container extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance, create_fragment, safe_not_equal, { className: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Container",
    			options,
    			id: create_fragment.name
    		});
    	}

    	get className() {
    		throw new Error("<Container>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set className(value) {
    		throw new Error("<Container>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\Header.svelte generated by Svelte v3.24.0 */
    const file$1 = "components\\Header.svelte";

    // (6:1) <Container>
    function create_default_slot(ctx) {
    	let div1;
    	let div0;
    	let svg;
    	let path;
    	let t;

    	const block = {
    		c: function create() {
    			div1 = element("div");
    			div0 = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t = text("\r\n\t\t \t正则大全");
    			attr_dev(path, "d", "M80.457143 687.542857h256v256H80.457143zM958.171429 277.942857l-36.571429-65.828571-160.914286 102.4V124.342857h-73.142857v190.171429L526.628571 212.114286l-43.885714 65.828571L658.285714 387.657143 482.742857 497.371429l43.885714 58.514285 160.914286-102.4v190.171429h73.142857V453.485714l160.914286 102.4 36.571429-58.514285-168.228572-109.714286z");
    			attr_dev(path, "p-id", "2464");
    			add_location(path, file$1, 9, 5, 446);
    			attr_dev(svg, "t", "1594273178370");
    			attr_dev(svg, "class", "fill-current");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "2463");
    			attr_dev(svg, "width", "24");
    			attr_dev(svg, "height", "24");
    			add_location(svg, file$1, 8, 4, 287);
    			attr_dev(div0, "class", "w-8 h-8 mr-2 flex items-center justify-center bg-white text-indigo-600");
    			add_location(div0, file$1, 7, 3, 197);
    			attr_dev(div1, "class", "flex items-center py-4 text-2xl font-bold ");
    			add_location(div1, file$1, 6, 2, 136);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div1, anchor);
    			append_dev(div1, div0);
    			append_dev(div0, svg);
    			append_dev(svg, path);
    			append_dev(div1, t);
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div1);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot.name,
    		type: "slot",
    		source: "(6:1) <Container>",
    		ctx
    	});

    	return block;
    }

    function create_fragment$1(ctx) {
    	let div;
    	let container;
    	let current;

    	container = new Container({
    			props: {
    				$$slots: { default: [create_default_slot] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			div = element("div");
    			create_component(container.$$.fragment);
    			attr_dev(div, "class", "bg-indigo-600 border-b text-white ");
    			add_location(div, file$1, 4, 0, 70);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			mount_component(container, div, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const container_changes = {};

    			if (dirty & /*$$scope*/ 1) {
    				container_changes.$$scope = { dirty, ctx };
    			}

    			container.$set(container_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(container.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(container.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			destroy_component(container);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$1.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$1($$self, $$props, $$invalidate) {
    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Header> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Header", $$slots, []);
    	$$self.$capture_state = () => ({ Container });
    	return [];
    }

    class Header extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$1, create_fragment$1, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Header",
    			options,
    			id: create_fragment$1.name
    		});
    	}
    }

    function cubicOut(t) {
        const f = t - 1.0;
        return f * f * f + 1.0;
    }
    function quintOut(t) {
        return --t * t * t * t * t + 1;
    }

    function fade(node, { delay = 0, duration = 400, easing = identity }) {
        const o = +getComputedStyle(node).opacity;
        return {
            delay,
            duration,
            easing,
            css: t => `opacity: ${t * o}`
        };
    }
    function fly(node, { delay = 0, duration = 400, easing = cubicOut, x = 0, y = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (t, u) => `
			transform: ${transform} translate(${(1 - t) * x}px, ${(1 - t) * y}px);
			opacity: ${target_opacity - (od * u)}`
        };
    }
    function slide(node, { delay = 0, duration = 400, easing = cubicOut }) {
        const style = getComputedStyle(node);
        const opacity = +style.opacity;
        const height = parseFloat(style.height);
        const padding_top = parseFloat(style.paddingTop);
        const padding_bottom = parseFloat(style.paddingBottom);
        const margin_top = parseFloat(style.marginTop);
        const margin_bottom = parseFloat(style.marginBottom);
        const border_top_width = parseFloat(style.borderTopWidth);
        const border_bottom_width = parseFloat(style.borderBottomWidth);
        return {
            delay,
            duration,
            easing,
            css: t => `overflow: hidden;` +
                `opacity: ${Math.min(t * 20, 1) * opacity};` +
                `height: ${t * height}px;` +
                `padding-top: ${t * padding_top}px;` +
                `padding-bottom: ${t * padding_bottom}px;` +
                `margin-top: ${t * margin_top}px;` +
                `margin-bottom: ${t * margin_bottom}px;` +
                `border-top-width: ${t * border_top_width}px;` +
                `border-bottom-width: ${t * border_bottom_width}px;`
        };
    }
    function scale(node, { delay = 0, duration = 400, easing = cubicOut, start = 0, opacity = 0 }) {
        const style = getComputedStyle(node);
        const target_opacity = +style.opacity;
        const transform = style.transform === 'none' ? '' : style.transform;
        const sd = 1 - start;
        const od = target_opacity * (1 - opacity);
        return {
            delay,
            duration,
            easing,
            css: (_t, u) => `
			transform: ${transform} scale(${1 - (sd * u)});
			opacity: ${target_opacity - (od * u)}
		`
        };
    }

    /* components\Search.svelte generated by Svelte v3.24.0 */
    const file$2 = "components\\Search.svelte";

    // (15:1) {#if keyword}
    function create_if_block(ctx) {
    	let div;
    	let button;
    	let svg;
    	let path;
    	let div_transition;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			button = element("button");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M1023.990329 511.995164a511.995164 511.995164 0 1 0-511.995165 511.995165 508.837861 508.837861 0 0 0 511.995165-511.995165z m-307.197099 255.997583L511.995164 563.194681 307.197099 767.992747A36.209436 36.209436 0 0 1 255.997582 716.79323l204.798066-204.798066L255.997582 307.197099A36.209436 36.209436 0 1 1 307.197099 255.997582l204.798065 204.798066L716.79323 255.997582a36.209436 36.209436 0 1 1 51.199517 51.199517L563.194681 511.995164l204.798066 204.798066a36.209436 36.209436 0 0 1-51.199517 51.199517z");
    			attr_dev(path, "p-id", "23226");
    			add_location(path, file$2, 17, 157, 832);
    			attr_dev(svg, "t", "1594263074395");
    			attr_dev(svg, "class", "fill-current");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "23225");
    			attr_dev(svg, "width", "20");
    			attr_dev(svg, "height", "20");
    			add_location(svg, file$2, 17, 4, 679);
    			attr_dev(button, "class", "text-gray-400 focus:outline-none");
    			add_location(button, file$2, 16, 3, 601);
    			attr_dev(div, "class", "absolute top-0 right-0 w-16 h-16 flex item-center justify-end pr-4");
    			add_location(div, file$2, 15, 2, 480);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, button);
    			append_dev(button, svg);
    			append_dev(svg, path);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*clickHandle*/ ctx[1], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 200 }, true);
    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(div, fade, { duration: 200 }, false);
    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block.name,
    		type: "if",
    		source: "(15:1) {#if keyword}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$2(ctx) {
    	let div;
    	let input;
    	let t;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block = /*keyword*/ ctx[0] && create_if_block(ctx);

    	const block = {
    		c: function create() {
    			div = element("div");
    			input = element("input");
    			t = space();
    			if (if_block) if_block.c();
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", "搜索关键词，如'手机'");
    			input.autofocus = true;
    			attr_dev(input, "class", "w-full p-4 h-16 pr-16 shadow rounded-md border-2 border-indigo-400 focus:border-indigo-400 focus:outline-none");
    			add_location(input, file$2, 13, 1, 266);
    			attr_dev(div, "class", "relative");
    			add_location(div, file$2, 12, 0, 241);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, input);
    			set_input_value(input, /*keyword*/ ctx[0]);
    			append_dev(div, t);
    			if (if_block) if_block.m(div, null);
    			current = true;
    			input.focus();

    			if (!mounted) {
    				dispose = listen_dev(input, "input", /*input_input_handler*/ ctx[2]);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*keyword*/ 1 && input.value !== /*keyword*/ ctx[0]) {
    				set_input_value(input, /*keyword*/ ctx[0]);
    			}

    			if (/*keyword*/ ctx[0]) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*keyword*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (if_block) if_block.d();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$2.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$2($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { keyword } = $$props;

    	function clickHandle() {
    		dispatch("clear");
    	}

    	const writable_props = ["keyword"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Search> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Search", $$slots, []);

    	function input_input_handler() {
    		keyword = this.value;
    		$$invalidate(0, keyword);
    	}

    	$$self.$set = $$props => {
    		if ("keyword" in $$props) $$invalidate(0, keyword = $$props.keyword);
    	};

    	$$self.$capture_state = () => ({
    		fade,
    		createEventDispatcher,
    		dispatch,
    		keyword,
    		clickHandle
    	});

    	$$self.$inject_state = $$props => {
    		if ("keyword" in $$props) $$invalidate(0, keyword = $$props.keyword);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [keyword, clickHandle, input_input_handler];
    }

    class Search extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$2, create_fragment$2, safe_not_equal, { keyword: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Search",
    			options,
    			id: create_fragment$2.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*keyword*/ ctx[0] === undefined && !("keyword" in props)) {
    			console.warn("<Search> was created without expected prop 'keyword'");
    		}
    	}

    	get keyword() {
    		throw new Error("<Search>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set keyword(value) {
    		throw new Error("<Search>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\Option.svelte generated by Svelte v3.24.0 */
    const file$3 = "components\\Option.svelte";

    function create_fragment$3(ctx) {
    	let div;
    	let svg;
    	let path;
    	let svg_class_value;
    	let t0;
    	let span;
    	let t1;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			t0 = space();
    			span = element("span");
    			t1 = text(/*label*/ ctx[0]);
    			attr_dev(path, "d", "M513.720178 62.432934c-247.53163 0-448.195835 200.664206-448.195835 448.195835 0 247.532653 200.664206 448.195835 448.195835 448.195835 247.532653 0 448.195835-200.662159 448.195835-448.195835C961.916013 263.098163 761.251807 62.432934 513.720178 62.432934L513.720178 62.432934zM770.794138 394.371976 480.923214 684.245969c0 0-0.00307 0.00307-0.00921 0.00921-13.363356 13.367449-33.740452 15.45397-49.295729 6.265704-2.880607-1.702782-5.597485-3.793396-8.070816-6.265704-0.002047-0.00307-0.005117-0.005117-0.005117-0.005117L256.647241 517.354961c-15.84078-15.84078-15.84078-41.527812 0-57.372685 15.84078-15.84078 41.527812-15.84078 57.368592 0l138.215922 138.215922 261.193791-261.193791c15.842827-15.84078 41.529859-15.84078 57.370639 0C786.634918 352.84621 786.634918 378.531196 770.794138 394.371976L770.794138 394.371976z");
    			attr_dev(path, "p-id", "17302");
    			add_location(path, file$3, 14, 4, 536);
    			attr_dev(svg, "t", "1594260801798");
    			attr_dev(svg, "class", svg_class_value = "fill-current mr-1  " + (/*checked*/ ctx[1] ? "text-green-400" : "text-gray-400"));
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "17301");
    			attr_dev(svg, "width", "16");
    			attr_dev(svg, "height", "16");
    			add_location(svg, file$3, 13, 2, 324);
    			attr_dev(span, "class", "capitalize");
    			add_location(span, file$3, 17, 2, 1413);
    			attr_dev(div, "class", "flex items-center mr-4 cursor-pointer text-gray-600");
    			add_location(div, file$3, 12, 0, 232);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);
    			append_dev(div, t0);
    			append_dev(div, span);
    			append_dev(span, t1);

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*clickHandle*/ ctx[2], false, false, false);
    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*checked*/ 2 && svg_class_value !== (svg_class_value = "fill-current mr-1  " + (/*checked*/ ctx[1] ? "text-green-400" : "text-gray-400"))) {
    				attr_dev(svg, "class", svg_class_value);
    			}

    			if (dirty & /*label*/ 1) set_data_dev(t1, /*label*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$3.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$3($$self, $$props, $$invalidate) {
    	const dispatch = createEventDispatcher();
    	let { label } = $$props;
    	let { checked } = $$props;

    	function clickHandle() {
    		dispatch("toggle", label);
    	}

    	const writable_props = ["label", "checked"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Option> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Option", $$slots, []);

    	$$self.$set = $$props => {
    		if ("label" in $$props) $$invalidate(0, label = $$props.label);
    		if ("checked" in $$props) $$invalidate(1, checked = $$props.checked);
    	};

    	$$self.$capture_state = () => ({
    		createEventDispatcher,
    		dispatch,
    		label,
    		checked,
    		clickHandle
    	});

    	$$self.$inject_state = $$props => {
    		if ("label" in $$props) $$invalidate(0, label = $$props.label);
    		if ("checked" in $$props) $$invalidate(1, checked = $$props.checked);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [label, checked, clickHandle];
    }

    class Option extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$3, create_fragment$3, safe_not_equal, { label: 0, checked: 1 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Option",
    			options,
    			id: create_fragment$3.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*label*/ ctx[0] === undefined && !("label" in props)) {
    			console.warn("<Option> was created without expected prop 'label'");
    		}

    		if (/*checked*/ ctx[1] === undefined && !("checked" in props)) {
    			console.warn("<Option> was created without expected prop 'checked'");
    		}
    	}

    	get label() {
    		throw new Error("<Option>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set label(value) {
    		throw new Error("<Option>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	get checked() {
    		throw new Error("<Option>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set checked(value) {
    		throw new Error("<Option>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\Item.svelte generated by Svelte v3.24.0 */
    const file$4 = "components\\Item.svelte";

    // (68:4) {#if value}
    function create_if_block_1(ctx) {
    	let button;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			button = element("button");
    			button.textContent = "清空";
    			attr_dev(button, "class", "ml-4 flex-shrink-0 text-sm text-gray-600 focus:outline-none");
    			add_location(button, file$4, 68, 6, 1874);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, button, anchor);

    			if (!mounted) {
    				dispose = listen_dev(button, "click", /*clearValueHandle*/ ctx[10], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(button);
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block_1.name,
    		type: "if",
    		source: "(68:4) {#if value}",
    		ctx
    	});

    	return block;
    }

    // (81:6) {#if isCopied}
    function create_if_block$1(ctx) {
    	let div;
    	let div_transition;
    	let current;

    	const block = {
    		c: function create() {
    			div = element("div");
    			div.textContent = "复制成功";
    			attr_dev(div, "class", "absolute right-0 flex-shrink-0 py-1 px-2 text-xs text-white bg-green-400 rounded origin-right");
    			add_location(div, file$4, 81, 8, 2429);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(
    					div,
    					scale,
    					{
    						duration: 200,
    						opacity: 0.5,
    						start: 0,
    						easing: quintOut
    					},
    					true
    				);

    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(
    				div,
    				scale,
    				{
    					duration: 200,
    					opacity: 0.5,
    					start: 0,
    					easing: quintOut
    				},
    				false
    			);

    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$1.name,
    		type: "if",
    		source: "(81:6) {#if isCopied}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$4(ctx) {
    	let div4;
    	let h1;
    	let t0_value = /*rule*/ ctx[0].title + "";
    	let t0;
    	let t1;
    	let div0;
    	let input;
    	let input_placeholder_value;
    	let input_class_value;
    	let t2;
    	let t3;
    	let div1;
    	let option0;
    	let t4;
    	let option1;
    	let t5;
    	let div3;
    	let span;
    	let t6_value = /*rule*/ ctx[0].rule + "";
    	let t6;
    	let t7;
    	let div2;
    	let t8;
    	let button;
    	let current;
    	let mounted;
    	let dispose;
    	let if_block0 = /*value*/ ctx[1] && create_if_block_1(ctx);

    	option0 = new Option({
    			props: {
    				label: "blur",
    				checked: /*blurChecked*/ ctx[2]
    			},
    			$$inline: true
    		});

    	option0.$on("toggle", /*toggleHandle*/ ctx[6]);

    	option1 = new Option({
    			props: {
    				label: "keyup",
    				checked: /*keyupChecked*/ ctx[3]
    			},
    			$$inline: true
    		});

    	option1.$on("toggle", /*toggleHandle*/ ctx[6]);
    	let if_block1 = /*isCopied*/ ctx[4] && create_if_block$1(ctx);

    	const block = {
    		c: function create() {
    			div4 = element("div");
    			h1 = element("h1");
    			t0 = text(t0_value);
    			t1 = space();
    			div0 = element("div");
    			input = element("input");
    			t2 = space();
    			if (if_block0) if_block0.c();
    			t3 = space();
    			div1 = element("div");
    			create_component(option0.$$.fragment);
    			t4 = space();
    			create_component(option1.$$.fragment);
    			t5 = space();
    			div3 = element("div");
    			span = element("span");
    			t6 = text(t6_value);
    			t7 = space();
    			div2 = element("div");
    			if (if_block1) if_block1.c();
    			t8 = space();
    			button = element("button");
    			button.textContent = "复制";
    			attr_dev(h1, "class", "text-xl font-bold break-words text-gray-700");
    			add_location(h1, file$4, 62, 2, 1359);
    			attr_dev(input, "type", "text");
    			attr_dev(input, "placeholder", input_placeholder_value = "例如：" + /*rule*/ ctx[0].examples.join("，"));

    			attr_dev(input, "class", input_class_value = "flex-1 p-2 text-sm border rounded focus:outline-none focus:shadow-md " + (/*isApproved*/ ctx[5] === 1
    			? "bg-green-200 text-green-800 border-green-600"
    			: "") + " " + (/*isApproved*/ ctx[5] === 0
    			? "bg-red-200 text-red-800 border-red-600"
    			: "") + " transition-all duration-150 ease-in-out");

    			add_location(input, file$4, 66, 4, 1475);
    			attr_dev(div0, "class", "flex my-4");
    			add_location(div0, file$4, 65, 2, 1446);
    			attr_dev(div1, "class", "flex flex-wrap my-4 text-sm");
    			add_location(div1, file$4, 71, 2, 2014);
    			attr_dev(span, "class", "flex-1 text-xs break-all");
    			add_location(span, file$4, 76, 4, 2298);
    			attr_dev(button, "class", "flex-shrink-0 ml-8 py-1 px-2 text-xs bg-indigo-500 text-white rounded");
    			add_location(button, file$4, 85, 6, 2669);
    			attr_dev(div2, "class", "relative");
    			add_location(div2, file$4, 79, 4, 2375);
    			attr_dev(div3, "class", "flex items-center p-2 text-gray-700 bg-gray-200 rounded");
    			add_location(div3, file$4, 75, 2, 2223);
    			attr_dev(div4, "class", "mb-4 p-4 bg-white border rounded-md");
    			add_location(div4, file$4, 61, 0, 1306);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div4, anchor);
    			append_dev(div4, h1);
    			append_dev(h1, t0);
    			append_dev(div4, t1);
    			append_dev(div4, div0);
    			append_dev(div0, input);
    			set_input_value(input, /*value*/ ctx[1]);
    			append_dev(div0, t2);
    			if (if_block0) if_block0.m(div0, null);
    			append_dev(div4, t3);
    			append_dev(div4, div1);
    			mount_component(option0, div1, null);
    			append_dev(div1, t4);
    			mount_component(option1, div1, null);
    			append_dev(div4, t5);
    			append_dev(div4, div3);
    			append_dev(div3, span);
    			append_dev(span, t6);
    			append_dev(div3, t7);
    			append_dev(div3, div2);
    			if (if_block1) if_block1.m(div2, null);
    			append_dev(div2, t8);
    			append_dev(div2, button);
    			current = true;

    			if (!mounted) {
    				dispose = [
    					listen_dev(input, "input", /*input_input_handler*/ ctx[11]),
    					listen_dev(input, "keyup", /*keyupHandle*/ ctx[7], false, false, false),
    					listen_dev(input, "blur", /*blurHandle*/ ctx[8], false, false, false),
    					listen_dev(button, "click", /*clickHandle*/ ctx[9], false, false, false)
    				];

    				mounted = true;
    			}
    		},
    		p: function update(ctx, [dirty]) {
    			if ((!current || dirty & /*rule*/ 1) && t0_value !== (t0_value = /*rule*/ ctx[0].title + "")) set_data_dev(t0, t0_value);

    			if (!current || dirty & /*rule*/ 1 && input_placeholder_value !== (input_placeholder_value = "例如：" + /*rule*/ ctx[0].examples.join("，"))) {
    				attr_dev(input, "placeholder", input_placeholder_value);
    			}

    			if (!current || dirty & /*isApproved*/ 32 && input_class_value !== (input_class_value = "flex-1 p-2 text-sm border rounded focus:outline-none focus:shadow-md " + (/*isApproved*/ ctx[5] === 1
    			? "bg-green-200 text-green-800 border-green-600"
    			: "") + " " + (/*isApproved*/ ctx[5] === 0
    			? "bg-red-200 text-red-800 border-red-600"
    			: "") + " transition-all duration-150 ease-in-out")) {
    				attr_dev(input, "class", input_class_value);
    			}

    			if (dirty & /*value*/ 2 && input.value !== /*value*/ ctx[1]) {
    				set_input_value(input, /*value*/ ctx[1]);
    			}

    			if (/*value*/ ctx[1]) {
    				if (if_block0) {
    					if_block0.p(ctx, dirty);
    				} else {
    					if_block0 = create_if_block_1(ctx);
    					if_block0.c();
    					if_block0.m(div0, null);
    				}
    			} else if (if_block0) {
    				if_block0.d(1);
    				if_block0 = null;
    			}

    			const option0_changes = {};
    			if (dirty & /*blurChecked*/ 4) option0_changes.checked = /*blurChecked*/ ctx[2];
    			option0.$set(option0_changes);
    			const option1_changes = {};
    			if (dirty & /*keyupChecked*/ 8) option1_changes.checked = /*keyupChecked*/ ctx[3];
    			option1.$set(option1_changes);
    			if ((!current || dirty & /*rule*/ 1) && t6_value !== (t6_value = /*rule*/ ctx[0].rule + "")) set_data_dev(t6, t6_value);

    			if (/*isCopied*/ ctx[4]) {
    				if (if_block1) {
    					if (dirty & /*isCopied*/ 16) {
    						transition_in(if_block1, 1);
    					}
    				} else {
    					if_block1 = create_if_block$1(ctx);
    					if_block1.c();
    					transition_in(if_block1, 1);
    					if_block1.m(div2, t8);
    				}
    			} else if (if_block1) {
    				group_outros();

    				transition_out(if_block1, 1, 1, () => {
    					if_block1 = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(option0.$$.fragment, local);
    			transition_in(option1.$$.fragment, local);
    			transition_in(if_block1);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(option0.$$.fragment, local);
    			transition_out(option1.$$.fragment, local);
    			transition_out(if_block1);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div4);
    			if (if_block0) if_block0.d();
    			destroy_component(option0);
    			destroy_component(option1);
    			if (if_block1) if_block1.d();
    			mounted = false;
    			run_all(dispose);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$4.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function copyToClipboard(text) {
    	const el = document.createElement("textarea");
    	el.value = text;
    	document.body.appendChild(el);
    	el.select();
    	document.execCommand("copy");
    	document.body.removeChild(el);
    }

    function instance$4($$self, $$props, $$invalidate) {
    	let { rule } = $$props;
    	let value = "";
    	let blurChecked = true;
    	let keyupChecked = true;
    	let isCopied = false;
    	let isApproved = 2;

    	function toggleHandle(e) {
    		const { detail } = e;

    		if (detail === "blur") {
    			$$invalidate(2, blurChecked = !blurChecked);
    		} else if (detail === "keyup") {
    			$$invalidate(3, keyupChecked = !keyupChecked);
    		}
    	}

    	function keyupHandle() {
    		if (keyupChecked && value.trim()) {
    			$$invalidate(5, isApproved = Number(rule.rule.test(value)));
    		}
    	}

    	function blurHandle() {
    		if (blurChecked && value.trim()) {
    			$$invalidate(5, isApproved = Number(rule.rule.test(value)));
    		}
    	}

    	function clickHandle() {
    		copyToClipboard(rule.rule);
    		$$invalidate(4, isCopied = true);

    		setTimeout(
    			() => {
    				$$invalidate(4, isCopied = false);
    			},
    			2000
    		);
    	}

    	function clearValueHandle() {
    		$$invalidate(1, value = "");
    	}

    	const writable_props = ["rule"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Item> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Item", $$slots, []);

    	function input_input_handler() {
    		value = this.value;
    		$$invalidate(1, value);
    	}

    	$$self.$set = $$props => {
    		if ("rule" in $$props) $$invalidate(0, rule = $$props.rule);
    	};

    	$$self.$capture_state = () => ({
    		fade,
    		slide,
    		fly,
    		scale,
    		quintOut,
    		Option,
    		rule,
    		value,
    		blurChecked,
    		keyupChecked,
    		isCopied,
    		isApproved,
    		copyToClipboard,
    		toggleHandle,
    		keyupHandle,
    		blurHandle,
    		clickHandle,
    		clearValueHandle
    	});

    	$$self.$inject_state = $$props => {
    		if ("rule" in $$props) $$invalidate(0, rule = $$props.rule);
    		if ("value" in $$props) $$invalidate(1, value = $$props.value);
    		if ("blurChecked" in $$props) $$invalidate(2, blurChecked = $$props.blurChecked);
    		if ("keyupChecked" in $$props) $$invalidate(3, keyupChecked = $$props.keyupChecked);
    		if ("isCopied" in $$props) $$invalidate(4, isCopied = $$props.isCopied);
    		if ("isApproved" in $$props) $$invalidate(5, isApproved = $$props.isApproved);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*value*/ 2) {
    			 if (!value.trim()) {
    				$$invalidate(5, isApproved = 2);
    			}
    		}
    	};

    	return [
    		rule,
    		value,
    		blurChecked,
    		keyupChecked,
    		isCopied,
    		isApproved,
    		toggleHandle,
    		keyupHandle,
    		blurHandle,
    		clickHandle,
    		clearValueHandle,
    		input_input_handler
    	];
    }

    class Item extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$4, create_fragment$4, safe_not_equal, { rule: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Item",
    			options,
    			id: create_fragment$4.name
    		});

    		const { ctx } = this.$$;
    		const props = options.props || {};

    		if (/*rule*/ ctx[0] === undefined && !("rule" in props)) {
    			console.warn("<Item> was created without expected prop 'rule'");
    		}
    	}

    	get rule() {
    		throw new Error("<Item>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set rule(value) {
    		throw new Error("<Item>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\Empty.svelte generated by Svelte v3.24.0 */

    const file$5 = "components\\Empty.svelte";

    function create_fragment$5(ctx) {
    	let div;
    	let svg;
    	let path0;
    	let path1;
    	let path2;
    	let path3;
    	let path4;
    	let path5;
    	let t0;
    	let t1;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			path0 = svg_element("path");
    			path1 = svg_element("path");
    			path2 = svg_element("path");
    			path3 = svg_element("path");
    			path4 = svg_element("path");
    			path5 = svg_element("path");
    			t0 = space();
    			t1 = text(/*text*/ ctx[0]);
    			attr_dev(path0, "d", "M456 864.8v-1.6 1.6z m57.6-58.4c-32 0-57.6 24.8-57.6 56.8v0.8c0 6.4 4.8 11.2 11.2 11.2s11.2-4.8 11.2-11.2v-0.8c0-18.4 15.2-34.4 34.4-34.4s34.4 16 34.4 34.4v0.8c0 6.4 4.8 11.2 11.2 11.2 6.4 0 11.2-4.8 11.2-11.2v-0.8c1.6-30.4-24.8-56.8-56-56.8zM380 717.6c-16-3.2-39.2-3.2-44.8 13.6-3.2 10.4 13.6 11.2 28.8 15.2 12 3.2 18.4 9.6 17.6 11.2-3.2 4-21.6-3.2-37.6 2.4s-12.8 20-3.2 24c9.6 3.2 24.8-0.8 60 4.8 17.6 3.2 28.8-3.2 31.2-13.6 3.2-24.8-29.6-52.8-52-57.6zM593.6 776c2.4 10.4 12 16.8 31.2 13.6 35.2-5.6 50.4-1.6 60-4.8 9.6-3.2 12-18.4-3.2-24-16-5.6-33.6 1.6-37.6-2.4-2.4-3.2 4.8-9.6 17.6-12 15.2-3.2 32-4.8 28.8-15.2-4.8-16.8-28-17.6-44.8-13.6-23.2 4.8-56 32.8-52 58.4z");
    			attr_dev(path0, "p-id", "19220");
    			attr_dev(path0, "fill", "");
    			add_location(path0, file$5, 7, 2, 292);
    			attr_dev(path1, "d", "M71.2 1024C32 1024 0 992 0 952.8V502.4c0-7.2 3.2-13.6 8-18.4l201.6-184c4.8-4 10.4-6.4 16.8-6.4h572.8c7.2 0 12.8 2.4 16.8 5.6l200 184c4.8 4.8 8.8 12 8.8 18.4V952c0 39.2-32 71.2-71.2 71.2H71.2z m-40-71.2c0 21.6 18.4 39.2 40.8 39.2h882.4c21.6 0 39.2-16.8 39.2-39.2V509.6H676.8l-1.6 9.6c-5.6 34.4-22.4 66.4-48.8 92.8-31.2 28.8-70.4 44.8-112 44.8-41.6 0-81.6-16-112-44.8-26.4-24-43.2-56.8-48.8-92.8l-1.6-9.6H31.2v443.2zM54.4 484h310.4c6.4 0 12 6.4 12 12.8 0 73.6 63.2 136 137.6 136S652 570.4 652 496.8c0-7.2 5.6-12.8 12-12.8h307.2L797.6 324h-568L54.4 484z m130.4-378.4c-28.8 0-52.8-24-52.8-52.8C132 24 156 0 184.8 0c28.8 0 52.8 24 52.8 52.8 0 28.8-24 52.8-52.8 52.8z m0-89.6c-20 0-36.8 16.8-36.8 36.8 0 20 16.8 36.8 36.8 36.8 20 0 36.8-16.8 36.8-36.8 0-20-16.8-36.8-36.8-36.8z m553.6 207.2c-19.2 0-35.2-16-35.2-35.2s16-35.2 35.2-35.2c19.2 0 35.2 16 35.2 35.2s-16 35.2-35.2 35.2z m0-53.6c-10.4 0-19.2 8.8-19.2 19.2S728 208 738.4 208s19.2-8.8 19.2-19.2-8.8-19.2-19.2-19.2zM364 179.2c-4.8 0-8-3.2-8-8v-36c0-4.8 3.2-8 8-8s8 3.2 8 8v36c0 4.8-4 8-8 8z");
    			attr_dev(path1, "p-id", "19221");
    			attr_dev(path1, "fill", "");
    			add_location(path1, file$5, 9, 2, 1006);
    			attr_dev(path2, "d", "M381.6 160.8h-36c-4.8 0-8-3.2-8-8s3.2-8 8-8h36c4.8 0 8 3.2 8 8s-3.2 8-8 8zM72 301.6c-4.8 0-8-3.2-8-8v-70.4c0-4.8 3.2-8 8-8s8 3.2 8 8v70.4c0 4.8-3.2 8-8 8z");
    			attr_dev(path2, "p-id", "19222");
    			attr_dev(path2, "fill", "");
    			add_location(path2, file$5, 11, 2, 2093);
    			attr_dev(path3, "d", "M107.2 266.4H36.8c-4.8 0-8-3.2-8-8s3.2-8 8-8h70.4c4.8 0 8 3.2 8 8s-3.2 8-8 8zM944 308c-4.8 0-8-3.2-8-8v-51.2c0-4.8 3.2-8 8-8s8 3.2 8 8V300c0 4.8-3.2 8-8 8z");
    			attr_dev(path3, "p-id", "19223");
    			attr_dev(path3, "fill", "");
    			add_location(path3, file$5, 13, 2, 2294);
    			attr_dev(path4, "d", "M969.6 282.4h-51.2c-4.8 0-8-3.2-8-8s3.2-8 8-8h51.2c4.8 0 8 3.2 8 8s-3.2 8-8 8zM856 169.6c-4.8 0-8-3.2-8-8V80.8c0-4.8 3.2-8 8-8s8 3.2 8 8v80.8c0 4.8-3.2 8-8 8z");
    			attr_dev(path4, "p-id", "19224");
    			attr_dev(path4, "fill", "");
    			add_location(path4, file$5, 15, 2, 2496);
    			attr_dev(path5, "d", "M896 129.6h-80c-4.8 0-8-3.2-8-8s3.2-8 8-8h80c4.8 0 8 3.2 8 8s-3.2 8-8 8z");
    			attr_dev(path5, "p-id", "19225");
    			attr_dev(path5, "fill", "");
    			add_location(path5, file$5, 17, 2, 2701);
    			attr_dev(svg, "t", "1594261764043");
    			attr_dev(svg, "class", "mb-8 fill-current");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "19219");
    			attr_dev(svg, "width", "80");
    			attr_dev(svg, "height", "80");
    			add_location(svg, file$5, 5, 1, 127);
    			attr_dev(div, "class", "flex flex-col items-center p-10 text-gray-500");
    			add_location(div, file$5, 4, 0, 65);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path0);
    			append_dev(svg, path1);
    			append_dev(svg, path2);
    			append_dev(svg, path3);
    			append_dev(svg, path4);
    			append_dev(svg, path5);
    			append_dev(div, t0);
    			append_dev(div, t1);
    		},
    		p: function update(ctx, [dirty]) {
    			if (dirty & /*text*/ 1) set_data_dev(t1, /*text*/ ctx[0]);
    		},
    		i: noop,
    		o: noop,
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$5.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$5($$self, $$props, $$invalidate) {
    	let { text = "未找到对应的正则，请更换搜索关键字" } = $$props;
    	const writable_props = ["text"];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<Empty> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("Empty", $$slots, []);

    	$$self.$set = $$props => {
    		if ("text" in $$props) $$invalidate(0, text = $$props.text);
    	};

    	$$self.$capture_state = () => ({ text });

    	$$self.$inject_state = $$props => {
    		if ("text" in $$props) $$invalidate(0, text = $$props.text);
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [text];
    }

    class Empty extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$5, create_fragment$5, safe_not_equal, { text: 0 });

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "Empty",
    			options,
    			id: create_fragment$5.name
    		});
    	}

    	get text() {
    		throw new Error("<Empty>: Props cannot be read directly from the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}

    	set text(value) {
    		throw new Error("<Empty>: Props cannot be set directly on the component instance unless compiling with 'accessors: true' or '<svelte:options accessors/>'");
    	}
    }

    /* components\BackToTop.svelte generated by Svelte v3.24.0 */
    const file$6 = "components\\BackToTop.svelte";

    // (33:0) {#if scrollTop > 500}
    function create_if_block$2(ctx) {
    	let div;
    	let svg;
    	let path;
    	let div_transition;
    	let current;
    	let mounted;
    	let dispose;

    	const block = {
    		c: function create() {
    			div = element("div");
    			svg = svg_element("svg");
    			path = svg_element("path");
    			attr_dev(path, "d", "M825.2 454.2l-268-276.20000001c-11.6-12-27.4-18.00000001-44.8-17.99999999l-0.8 0c-17.4 0-33.2 6-44.8 17.99999999l-268 276.20000001c-25 24-25 62.6 0 86.4 25 23.8 65.4 23.8 90.4 0l158.8-166 0 428c0 33.79999999 28.6 61.2 64 61.2 36 0 64-27.4 64-61.2l0-428 158.8 166c25 23.8 65.4 23.8 90.4 0s25-62.40000001 0-86.4z");
    			attr_dev(path, "p-id", "2067");
    			add_location(path, file$6, 35, 4, 1336);
    			attr_dev(svg, "t", "1594270331425");
    			attr_dev(svg, "class", "fill-current");
    			attr_dev(svg, "viewBox", "0 0 1024 1024");
    			attr_dev(svg, "version", "1.1");
    			attr_dev(svg, "xmlns", "http://www.w3.org/2000/svg");
    			attr_dev(svg, "p-id", "2066");
    			attr_dev(svg, "width", "24");
    			attr_dev(svg, "height", "24");
    			add_location(svg, file$6, 34, 2, 1178);
    			attr_dev(div, "class", "fixed right-0 bottom-0 mb-8 mr-8 p-3 bg-black text-white bg-opacity-75 rounded-full cursor-pointer");
    			add_location(div, file$6, 33, 0, 960);
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, div, anchor);
    			append_dev(div, svg);
    			append_dev(svg, path);
    			current = true;

    			if (!mounted) {
    				dispose = listen_dev(div, "click", /*scrollToTop*/ ctx[1], false, false, false);
    				mounted = true;
    			}
    		},
    		p: noop,
    		i: function intro(local) {
    			if (current) return;

    			add_render_callback(() => {
    				if (!div_transition) div_transition = create_bidirectional_transition(
    					div,
    					scale,
    					{
    						duration: 400,
    						opacity: 0.1,
    						start: 0,
    						easing: quintOut
    					},
    					true
    				);

    				div_transition.run(1);
    			});

    			current = true;
    		},
    		o: function outro(local) {
    			if (!div_transition) div_transition = create_bidirectional_transition(
    				div,
    				scale,
    				{
    					duration: 400,
    					opacity: 0.1,
    					start: 0,
    					easing: quintOut
    				},
    				false
    			);

    			div_transition.run(0);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(div);
    			if (detaching && div_transition) div_transition.end();
    			mounted = false;
    			dispose();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$2.name,
    		type: "if",
    		source: "(33:0) {#if scrollTop > 500}",
    		ctx
    	});

    	return block;
    }

    function create_fragment$6(ctx) {
    	let if_block_anchor;
    	let current;
    	let if_block = /*scrollTop*/ ctx[0] > 500 && create_if_block$2(ctx);

    	const block = {
    		c: function create() {
    			if (if_block) if_block.c();
    			if_block_anchor = empty();
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			if (if_block) if_block.m(target, anchor);
    			insert_dev(target, if_block_anchor, anchor);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			if (/*scrollTop*/ ctx[0] > 500) {
    				if (if_block) {
    					if_block.p(ctx, dirty);

    					if (dirty & /*scrollTop*/ 1) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$2(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(if_block_anchor.parentNode, if_block_anchor);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (if_block) if_block.d(detaching);
    			if (detaching) detach_dev(if_block_anchor);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$6.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$6($$self, $$props, $$invalidate) {
    	let scrollTop = 0;
    	let timer;

    	onMount(() => {
    		$$invalidate(0, scrollTop = document.documentElement.scrollTop || document.body.scrollTop);
    		window.addEventListener("scroll", setScrollTop);
    	});

    	function setScrollTop() {
    		$$invalidate(0, scrollTop = document.documentElement.scrollTop || document.body.scrollTop);
    	}

    	function scrollToTop() {
    		cancelAnimationFrame(timer);

    		timer = requestAnimationFrame(function fn() {
    			var oTop = document.body.scrollTop || document.documentElement.scrollTop;

    			if (oTop > 0) {
    				document.body.scrollTop = document.documentElement.scrollTop = oTop - oTop / 6; //可以调整数字明确放慢速度20->50,为0时为正常速度
    				timer = requestAnimationFrame(fn);
    			} else {
    				cancelAnimationFrame(timer);
    			}
    		});
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<BackToTop> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("BackToTop", $$slots, []);

    	$$self.$capture_state = () => ({
    		onMount,
    		scale,
    		quintOut,
    		scrollTop,
    		timer,
    		setScrollTop,
    		scrollToTop
    	});

    	$$self.$inject_state = $$props => {
    		if ("scrollTop" in $$props) $$invalidate(0, scrollTop = $$props.scrollTop);
    		if ("timer" in $$props) timer = $$props.timer;
    	};

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	return [scrollTop, scrollToTop];
    }

    class BackToTop extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$6, create_fragment$6, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "BackToTop",
    			options,
    			id: create_fragment$6.name
    		});
    	}
    }

    /* App.svelte generated by Svelte v3.24.0 */
    const file$7 = "App.svelte";

    function get_each_context(ctx, list, i) {
    	const child_ctx = ctx.slice();
    	child_ctx[4] = list[i];
    	return child_ctx;
    }

    // (33:6) {#each rules as rule}
    function create_each_block(ctx) {
    	let item;
    	let current;

    	item = new Item({
    			props: { rule: /*rule*/ ctx[4] },
    			$$inline: true
    		});

    	const block = {
    		c: function create() {
    			create_component(item.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(item, target, anchor);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const item_changes = {};
    			if (dirty & /*rules*/ 2) item_changes.rule = /*rule*/ ctx[4];
    			item.$set(item_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(item.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(item.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(item, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_each_block.name,
    		type: "each",
    		source: "(33:6) {#each rules as rule}",
    		ctx
    	});

    	return block;
    }

    // (36:6) {#if rules.length === 0}
    function create_if_block$3(ctx) {
    	let empty_1;
    	let current;
    	empty_1 = new Empty({ $$inline: true });

    	const block = {
    		c: function create() {
    			create_component(empty_1.$$.fragment);
    		},
    		m: function mount(target, anchor) {
    			mount_component(empty_1, target, anchor);
    			current = true;
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(empty_1.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(empty_1.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(empty_1, detaching);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_if_block$3.name,
    		type: "if",
    		source: "(36:6) {#if rules.length === 0}",
    		ctx
    	});

    	return block;
    }

    // (30:2) <Container className="pt-6">
    function create_default_slot$1(ctx) {
    	let search;
    	let updating_keyword;
    	let t0;
    	let div;
    	let t1;
    	let current;

    	function search_keyword_binding(value) {
    		/*search_keyword_binding*/ ctx[3].call(null, value);
    	}

    	let search_props = {};

    	if (/*keyword*/ ctx[0] !== void 0) {
    		search_props.keyword = /*keyword*/ ctx[0];
    	}

    	search = new Search({ props: search_props, $$inline: true });
    	binding_callbacks.push(() => bind(search, "keyword", search_keyword_binding));
    	search.$on("clear", /*clearKeywordHandle*/ ctx[2]);
    	let each_value = /*rules*/ ctx[1];
    	validate_each_argument(each_value);
    	let each_blocks = [];

    	for (let i = 0; i < each_value.length; i += 1) {
    		each_blocks[i] = create_each_block(get_each_context(ctx, each_value, i));
    	}

    	const out = i => transition_out(each_blocks[i], 1, 1, () => {
    		each_blocks[i] = null;
    	});

    	let if_block = /*rules*/ ctx[1].length === 0 && create_if_block$3(ctx);

    	const block = {
    		c: function create() {
    			create_component(search.$$.fragment);
    			t0 = space();
    			div = element("div");

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].c();
    			}

    			t1 = space();
    			if (if_block) if_block.c();
    			attr_dev(div, "class", "mt-6 svelte-104nn4y");
    			add_location(div, file$7, 31, 4, 831);
    		},
    		m: function mount(target, anchor) {
    			mount_component(search, target, anchor);
    			insert_dev(target, t0, anchor);
    			insert_dev(target, div, anchor);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				each_blocks[i].m(div, null);
    			}

    			append_dev(div, t1);
    			if (if_block) if_block.m(div, null);
    			current = true;
    		},
    		p: function update(ctx, dirty) {
    			const search_changes = {};

    			if (!updating_keyword && dirty & /*keyword*/ 1) {
    				updating_keyword = true;
    				search_changes.keyword = /*keyword*/ ctx[0];
    				add_flush_callback(() => updating_keyword = false);
    			}

    			search.$set(search_changes);

    			if (dirty & /*rules*/ 2) {
    				each_value = /*rules*/ ctx[1];
    				validate_each_argument(each_value);
    				let i;

    				for (i = 0; i < each_value.length; i += 1) {
    					const child_ctx = get_each_context(ctx, each_value, i);

    					if (each_blocks[i]) {
    						each_blocks[i].p(child_ctx, dirty);
    						transition_in(each_blocks[i], 1);
    					} else {
    						each_blocks[i] = create_each_block(child_ctx);
    						each_blocks[i].c();
    						transition_in(each_blocks[i], 1);
    						each_blocks[i].m(div, t1);
    					}
    				}

    				group_outros();

    				for (i = each_value.length; i < each_blocks.length; i += 1) {
    					out(i);
    				}

    				check_outros();
    			}

    			if (/*rules*/ ctx[1].length === 0) {
    				if (if_block) {
    					if (dirty & /*rules*/ 2) {
    						transition_in(if_block, 1);
    					}
    				} else {
    					if_block = create_if_block$3(ctx);
    					if_block.c();
    					transition_in(if_block, 1);
    					if_block.m(div, null);
    				}
    			} else if (if_block) {
    				group_outros();

    				transition_out(if_block, 1, 1, () => {
    					if_block = null;
    				});

    				check_outros();
    			}
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(search.$$.fragment, local);

    			for (let i = 0; i < each_value.length; i += 1) {
    				transition_in(each_blocks[i]);
    			}

    			transition_in(if_block);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(search.$$.fragment, local);
    			each_blocks = each_blocks.filter(Boolean);

    			for (let i = 0; i < each_blocks.length; i += 1) {
    				transition_out(each_blocks[i]);
    			}

    			transition_out(if_block);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			destroy_component(search, detaching);
    			if (detaching) detach_dev(t0);
    			if (detaching) detach_dev(div);
    			destroy_each(each_blocks, detaching);
    			if (if_block) if_block.d();
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_default_slot$1.name,
    		type: "slot",
    		source: "(30:2) <Container className=\\\"pt-6\\\">",
    		ctx
    	});

    	return block;
    }

    function create_fragment$7(ctx) {
    	let main;
    	let header;
    	let t0;
    	let container;
    	let t1;
    	let backtotop;
    	let current;
    	header = new Header({ $$inline: true });

    	container = new Container({
    			props: {
    				className: "pt-6",
    				$$slots: { default: [create_default_slot$1] },
    				$$scope: { ctx }
    			},
    			$$inline: true
    		});

    	backtotop = new BackToTop({ $$inline: true });

    	const block = {
    		c: function create() {
    			main = element("main");
    			create_component(header.$$.fragment);
    			t0 = space();
    			create_component(container.$$.fragment);
    			t1 = space();
    			create_component(backtotop.$$.fragment);
    			attr_dev(main, "class", "min-w-screen min-h-screen pb-8 bg-gray-200 svelte-104nn4y");
    			add_location(main, file$7, 27, 0, 668);
    		},
    		l: function claim(nodes) {
    			throw new Error("options.hydrate only works if the component was compiled with the `hydratable: true` option");
    		},
    		m: function mount(target, anchor) {
    			insert_dev(target, main, anchor);
    			mount_component(header, main, null);
    			append_dev(main, t0);
    			mount_component(container, main, null);
    			append_dev(main, t1);
    			mount_component(backtotop, main, null);
    			current = true;
    		},
    		p: function update(ctx, [dirty]) {
    			const container_changes = {};

    			if (dirty & /*$$scope, rules, keyword*/ 131) {
    				container_changes.$$scope = { dirty, ctx };
    			}

    			container.$set(container_changes);
    		},
    		i: function intro(local) {
    			if (current) return;
    			transition_in(header.$$.fragment, local);
    			transition_in(container.$$.fragment, local);
    			transition_in(backtotop.$$.fragment, local);
    			current = true;
    		},
    		o: function outro(local) {
    			transition_out(header.$$.fragment, local);
    			transition_out(container.$$.fragment, local);
    			transition_out(backtotop.$$.fragment, local);
    			current = false;
    		},
    		d: function destroy(detaching) {
    			if (detaching) detach_dev(main);
    			destroy_component(header);
    			destroy_component(container);
    			destroy_component(backtotop);
    		}
    	};

    	dispatch_dev("SvelteRegisterBlock", {
    		block,
    		id: create_fragment$7.name,
    		type: "component",
    		source: "",
    		ctx
    	});

    	return block;
    }

    function instance$7($$self, $$props, $$invalidate) {
    	let keyword = "";

    	function clearKeywordHandle() {
    		$$invalidate(0, keyword = "");
    	}

    	const writable_props = [];

    	Object.keys($$props).forEach(key => {
    		if (!~writable_props.indexOf(key) && key.slice(0, 2) !== "$$") console.warn(`<App> was created with unknown prop '${key}'`);
    	});

    	let { $$slots = {}, $$scope } = $$props;
    	validate_slots("App", $$slots, []);

    	function search_keyword_binding(value) {
    		keyword = value;
    		$$invalidate(0, keyword);
    	}

    	$$self.$capture_state = () => ({
    		rulesList,
    		Header,
    		Container,
    		Search,
    		Item,
    		Empty,
    		BackToTop,
    		keyword,
    		clearKeywordHandle,
    		rules
    	});

    	$$self.$inject_state = $$props => {
    		if ("keyword" in $$props) $$invalidate(0, keyword = $$props.keyword);
    		if ("rules" in $$props) $$invalidate(1, rules = $$props.rules);
    	};

    	let rules;

    	if ($$props && "$$inject" in $$props) {
    		$$self.$inject_state($$props.$$inject);
    	}

    	$$self.$$.update = () => {
    		if ($$self.$$.dirty & /*keyword*/ 1) {
    			 $$invalidate(1, rules = rulesList.filter(rule => rule.title.toLowerCase().includes(keyword)));
    		}
    	};

    	return [keyword, rules, clearKeywordHandle, search_keyword_binding];
    }

    class App extends SvelteComponentDev {
    	constructor(options) {
    		super(options);
    		init(this, options, instance$7, create_fragment$7, safe_not_equal, {});

    		dispatch_dev("SvelteRegisterComponent", {
    			component: this,
    			tagName: "App",
    			options,
    			id: create_fragment$7.name
    		});
    	}
    }

    const app = new App({
      target: document.body
    });

    return app;

}());
//# sourceMappingURL=bundle.js.map
