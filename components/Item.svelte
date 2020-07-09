<script>
  import { fade, slide, fly, scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";
  import Option from "./Option.svelte";

  export let rule;
  let value = "";
  let blurChecked = true;
  let keyupChecked = true;
  let isCopied = false;
  let isApproved = 2;

  function copyToClipboard(text) {
    const el = document.createElement("textarea");
    el.value = text;
    document.body.appendChild(el);
    el.select();
    document.execCommand("copy");
    document.body.removeChild(el);
  }

  function toggleHandle(e) {
    const { detail } = e;

    if (detail === "blur") {
      blurChecked = !blurChecked;
    } else if (detail === "keyup") {
      keyupChecked = !keyupChecked;
    }
  }

  function keyupHandle() {
    if (keyupChecked && value.trim()) {
      isApproved = Number(rule.rule.test(value));
    }
  }

  function blurHandle() {
    if (blurChecked && value.trim()) {
      isApproved = Number(rule.rule.test(value));
    }
  }

  function clickHandle() {
    copyToClipboard(rule.rule);
    isCopied = true;

    setTimeout(() => {
      isCopied = false;
    }, 2000);
  }

  function clearValueHandle() {
    value = "";
  }

  $: if (!value.trim()) {
    isApproved = 2;
  }
</script>

<div class="mb-4 p-4 bg-white border rounded-md">
  <h1 class="text-xl font-bold break-words text-gray-700">
    {rule.title}
  </h1>
  <div class="flex my-4">
    <input type="text" placeholder="例如：{rule.examples.join('，')}" class="flex-1 p-2 text-sm border rounded focus:outline-none focus:shadow-md {isApproved === 1 ? 'bg-green-200 text-green-800 border-green-600' : ''} {isApproved === 0 ? 'bg-red-200 text-red-800 border-red-600' : ''} transition-all duration-150 ease-in-out" bind:value on:keyup={keyupHandle} on:blur={blurHandle}>
    {#if value}
      <button class="ml-4 flex-shrink-0 text-sm text-gray-600 focus:outline-none" on:click={clearValueHandle}>清空</button>
    {/if}
  </div>
  <div class="flex flex-wrap my-4 text-sm">
    <Option label="blur" checked={blurChecked} on:toggle={toggleHandle} />
    <Option label="keyup" checked={keyupChecked} on:toggle={toggleHandle} />
  </div>
  <div class="flex items-center p-2 text-gray-700 bg-gray-200 rounded">
    <span class="flex-1 text-xs break-all">
      {rule.rule}
    </span>
    <div class="relative">
      {#if isCopied}
        <div class="absolute right-0 flex-shrink-0 py-1 px-2 text-xs text-white bg-green-400 rounded origin-right" transition:scale="{{duration: 200, opacity: 0.5, start: 0, easing: quintOut}}" >
          复制成功
        </div>
      {/if}
      <button class="flex-shrink-0 ml-8 py-1 px-2 text-xs bg-indigo-500 text-white rounded" 
      on:click={clickHandle}>
        复制
      </button>
    </div>
  </div>
</div>
