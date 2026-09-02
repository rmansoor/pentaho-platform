/*!
 * Helix Platform — static require-init.js  (replaces the OSGi pentaho-requirejs-osgi-manager)
 *
 * The OSGi RequireJS manager generated this file at runtime by aggregating AMD/webpackage
 * config contributed by OSGi bundles. Helix CE ships no webpackage/OSGi bundles, so that
 * aggregation is always empty — this file is the fixed equivalent.
 *
 * Served only via PentahoWebContextFilter at
 *   /osgi/requirejs-manager/js/require-init.js?requirejs=false
 * i.e. AFTER webcontext.js has already loaded RequireJS itself from
 *   content/common-ui/resources/web/require.js
 * so this file must NOT include the RequireJS library — only the config step.
 *
 * Plugins still contribute their RequireJS config the classic way, through
 *   <external-resources context="requirejs"> in plugin.xml
 * which webcontext.js emits into window.requireCfg before this runs; the block below
 * merges that (window.requireCfg.config / .waitSeconds) into the live require.config().
 *
 * If Helix ever needs true runtime webpackage federation again, this becomes a
 * build-time generator over the shipped plugin set (Karaf Exit Plan "Phase 3").
 */
if ( typeof require === "undefined" || typeof require.config !== "function" ) {
  // RequireJS not present yet — nothing to configure. (webcontext.js loads it first in normal flow.)
} else
(function(w) {
  if (w.CONTEXT_PATH == null) {
    w.CONTEXT_PATH = "/pentaho/osgi/";
  }

  var legacyConfig = null;
  var legacyWaitSeconds = null;
  var environment = null;
  if (w.requireCfg != null) {
    if (w.requireCfg.waitSeconds != null) {
      legacyWaitSeconds = w.requireCfg.waitSeconds;
    }
    if (w.requireCfg.config != null) {
      legacyConfig = w.requireCfg.config;
      environment = legacyConfig["pentaho/environment"];
    }
  }
  function getVersionedModuleId(moduleIdsMappings, moduleId) {
    if (moduleId.indexOf("!") != -1) {
      var parts = moduleId.split("!", 2).slice(0);
      return getVersionedModuleId(moduleIdsMappings, parts[0]) + "!" + getVersionedModuleId(moduleIdsMappings, parts[1]);
    }
    
    var baseModuleId = moduleId;

    if (!moduleIdsMappings.hasOwnProperty(moduleId)) {
      var longestBaseModuleId = "";
      for(var candidateBaseModuleId in moduleIdsMappings) {
        if(moduleId.indexOf(candidateBaseModuleId) === 0 && candidateBaseModuleId.length > longestBaseModuleId.length) {
          longestBaseModuleId = candidateBaseModuleId;
        }
      }

      if(longestBaseModuleId.length === 0) {
        return moduleId;
      }

      baseModuleId = longestBaseModuleId;
    }

    var versionedBaseModuleId = moduleIdsMappings[baseModuleId];
    var moduleIdLeaf = moduleId.substring(baseModuleId.length);
    if (moduleIdLeaf.length > 0 && moduleIdLeaf.indexOf("/") !== 0) {
      // false positive, we just caught a substring (probably some old mapping that included an hardcoded version)
      return moduleId;
    }

    return versionedBaseModuleId + moduleIdLeaf;
  }

  var requireCfg = {"paths":{},"bundles":{},"packages":[],"shim":{},"map":{"*":{}},"config":{}};


  requireCfg.skipDataMain = true;

  if (legacyWaitSeconds != null) {
    requireCfg.waitSeconds = legacyWaitSeconds;
  }

  if (legacyConfig != null) {
    for (var key in legacyConfig) {
      if (Object.prototype.hasOwnProperty.call(legacyConfig, key)) {
        if (!requireCfg.config[key]) {
          requireCfg.config[key] = {};
        }

        for (var moduleId in legacyConfig[key]) {
          if (Object.prototype.hasOwnProperty.call(legacyConfig[key], moduleId)) {
            requireCfg.config[key][moduleId] = legacyConfig[key][moduleId];
          }
        }
      }
    }
  }

  require.config(requireCfg);
}(window));
