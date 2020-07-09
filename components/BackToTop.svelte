<script>
  import { onMount } from "svelte";
  import { scale } from "svelte/transition";
  import { quintOut } from "svelte/easing";

  let scrollTop = 0;
  let timer;

  onMount(() => {
    scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
    window.addEventListener("scroll", setScrollTop);
  });

  function setScrollTop() {
    scrollTop = document.documentElement.scrollTop || document.body.scrollTop;
  }

  function scrollToTop() {
    cancelAnimationFrame(timer);
    timer = requestAnimationFrame(function fn() {
      var oTop = document.body.scrollTop || document.documentElement.scrollTop;
      if (oTop > 0) {
        document.body.scrollTop = document.documentElement.scrollTop =
          oTop - oTop / 6; //可以调整数字明确放慢速度20->50,为0时为正常速度
        timer = requestAnimationFrame(fn);
      } else {
        cancelAnimationFrame(timer);
      }
    });
  }
</script>

{#if scrollTop > 500}
  <div
    class="fixed right-0 bottom-0 mb-8 mr-8 p-3 bg-black text-white
    bg-opacity-75 rounded-full cursor-pointer"
    transition:scale={{ duration: 400, opacity: 0.1, start: 0, easing: quintOut }}
    on:click={scrollToTop}>
    <svg
      t="1594270331425"
      class="fill-current"
      viewBox="0 0 1024 1024"
      version="1.1"
      xmlns="http://www.w3.org/2000/svg"
      p-id="2066"
      width="24"
      height="24">
      <path
        d="M825.2
        454.2l-268-276.20000001c-11.6-12-27.4-18.00000001-44.8-17.99999999l-0.8
        0c-17.4 0-33.2 6-44.8 17.99999999l-268 276.20000001c-25 24-25 62.6 0
        86.4 25 23.8 65.4 23.8 90.4 0l158.8-166 0 428c0 33.79999999 28.6 61.2 64
        61.2 36 0 64-27.4 64-61.2l0-428 158.8 166c25 23.8 65.4 23.8 90.4
        0s25-62.40000001 0-86.4z"
        p-id="2067" />
    </svg>
  </div>
{/if}
