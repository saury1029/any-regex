<script>
  import rulesList from "./RULES";
  import Header from "./components/Header.svelte";
  import Container from "./components/Container.svelte";
  import Search from "./components/Search.svelte";
  import Item from "./components/Item.svelte";
  import Empty from "./components/Empty.svelte";
  import BackToTop from "./components/BackToTop.svelte";

  let keyword = "";

  $: rules = rulesList.filter(rule =>
    rule.title.toLowerCase().includes(keyword)
  );

  function clearKeywordHandle() {
    keyword = "";
  }
</script>

<style global>
  @tailwind base;
  @tailwind components;
  @tailwind utilities;
  * {
    -webkit-tap-highlight-color: rgba(0, 0, 0, 0);
  }
  main {
    font-family: Arial, Helvetica, sans-serif;
  }
</style>

<main class="min-w-screen min-h-screen pb-8 bg-gray-200">
  <Header />
  <Container className="pt-6">
    <Search bind:keyword on:clear={clearKeywordHandle} />
    <div class="mt-6">
      {#each rules as rule}
        <Item {rule} />
      {/each}
      {#if rules.length === 0}
        <Empty />
      {/if}
    </div>
  </Container>
  <BackToTop />
</main>
