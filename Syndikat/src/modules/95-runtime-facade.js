/* SYNDIKAT_V56_RUNTIME_FACADE_BEGIN */
(function SYNDIKAT_V56_RUNTIME_FACADE(){
  const contract=Object.freeze({
    version:'5.6',saveSchema:4,storySchema:51,rulesRevision:4,
    systems:Object.freeze({
      cloud:()=>window.SyndikatCloud||null,
      online:()=>window.SyndikatOnline||null,
      operations:()=>window.SyndikatV4||null,
      economy:()=>window.SyndikatEconomyDepth||null,
      espionage:()=>window.SyndikatDepth||null,
      justice:()=>window.SyndikatJustice||null,
      final:()=>window.SyndikatFinalSystems||null,
      accountPush:()=>window.SyndikatAccountPush||null
    })
  });
  window.SyndikatRuntime=contract;
})();
/* SYNDIKAT_V56_RUNTIME_FACADE_END */