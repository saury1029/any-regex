<script>
  import { fade } from "svelte/transition";
  import { createEventDispatcher } from "svelte";

  const dispatch = createEventDispatcher();
  export let keyword;

  function clickHandle() {
    dispatch("clear");
  }

  function focus(node) {
    node.focus();
  }
</script>

<div class="relative">
  <input
    type="text"
    placeholder="搜索关键词，如'手机'"
    class="w-full p-4 h-12 pr-10 rounded-md border-2 focus:border-indigo-400
    focus:outline-none focus:shadow"
    bind:value={keyword}
    use:focus />
  {#if keyword}
    <div
      class="absolute top-0 right-0 w-12 h-12 flex item-center justify-end pr-4"
      transition:fade={{ duration: 200 }}>
      <button class="text-gray-400 focus:outline-none" on:click={clickHandle}>
        <svg
          t="1594263074395"
          class="fill-current"
          viewBox="0 0 1024 1024"
          version="1.1"
          xmlns="http://www.w3.org/2000/svg"
          p-id="23225"
          width="20"
          height="20">
          <path
            d="M1023.990329 511.995164a511.995164 511.995164 0 1 0-511.995165
            511.995165 508.837861 508.837861 0 0 0 511.995165-511.995165z
            m-307.197099 255.997583L511.995164 563.194681 307.197099
            767.992747A36.209436 36.209436 0 0 1 255.997582
            716.79323l204.798066-204.798066L255.997582 307.197099A36.209436
            36.209436 0 1 1 307.197099 255.997582l204.798065
            204.798066L716.79323 255.997582a36.209436 36.209436 0 1 1 51.199517
            51.199517L563.194681 511.995164l204.798066 204.798066a36.209436
            36.209436 0 0 1-51.199517 51.199517z"
            p-id="23226" />
        </svg>
      </button>
    </div>
  {/if}
</div>
