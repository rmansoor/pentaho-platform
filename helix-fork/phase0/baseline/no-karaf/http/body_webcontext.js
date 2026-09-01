/** webcontext.js is created by a PentahoWebContextFilter. This filter searches for an incoming URI having "webcontext.js" in it. If it finds that, it write CONTEXT_PATH and FULL_QUALIFIED_URL and it values from the servlet request to this js **/ 



/** @deprecated - use 'pentaho/environment' module's variable instead */
var CONTEXT_PATH = "\/pentaho\/";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var FULL_QUALIFIED_URL = "http:\/\/localhost:8080\/pentaho\/";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var SERVER_PROTOCOL = "http";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var PENTAHO_CONTEXT_NAME = null;

/** @deprecated - use 'pentaho/environment' module's variable instead */
var active_theme = "ruby";

var requireCfg = {
  waitSeconds: 30,
  paths: {},
  shim: {},
  map: {"*": {}},
  bundles: {},
  config: {"pentaho/modules": {}},
  packages: []
};

// configuration for 'pentaho/environment' amd module
requireCfg.config["pentaho/environment"] = {
  application: null,
  theme: "ruby",
  locale: "en_US",
  user: {
    id: "admin",
    home: "\/home\/admin"
  },
  reservedChars: "\/\\\t\r\n",
  server: {
    root: "\/pentaho\/",
    packages: "\/pentaho\/osgi\/",
    services: "\/pentaho\/osgi\/cxf\/"
  }
};

<!-- Injecting web resources defined in by plugins as external-resources for: requirejs-->
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/scheduler-plugin/resources/scheduler-plugin-require-js-cfg.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "js/require-js-cfg.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/pentaho-cdf/js/cdf-require-js-cfg.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/pentaho-cdf-dd/js/cde-require-js-cfg.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/reporting/reportviewer/reporting-require-js-cfg.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/common-ui-require-js-cfg.js'></scr"+"ipt>");
document.write("<script type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/require.js'></scr"+"ipt>");

document.write("<script type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/require-cfg.js'></scr"+"ipt>");

/** @deprecated - use 'pentaho/environment' module's variable instead */
var SESSION_NAME = "admin";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var SESSION_LOCALE = "en_US";
// If RequireJs is available, supply a module
if (typeof(pen) !== 'undefined' && pen.define) {
  pen.define('Locale', {locale: "en_US" });
}

/** @deprecated - use 'pentaho/environment' module's variable instead */
var HOME_FOLDER = "\/home\/admin";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var DEFAULT_FOLDER = "\/home\/admin";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var RESERVED_CHARS = "\/\\\t\r\n";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var RESERVED_CHARS_DISPLAY = "\/, \\, \\t, \\r, \\n";

/** @deprecated - use 'pentaho/environment' module's variable instead */
var RESERVED_CHARS_REGEX_PATTERN = /.*[\/\\\t\r\n]+.*/;

document.write("<script type='text/javascript' src='" + CONTEXT_PATH + "osgi/requirejs-manager/js/require-init.js?requirejs=false'></scr"+"ipt>");

<!-- Injecting web resources defined in by plugins as external-resources for: global-->
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "js/themes.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/themes/jquery.js'></scr"+"ipt>");
document.write("<link rel='stylesheet' type='text/css' href='" + CONTEXT_PATH + "content/data-access/resources/gwt/datasourceEditorDialog.css'/>");
document.write("<link rel='stylesheet' type='text/css' href='" + CONTEXT_PATH + "content/data-access/resources/gwt/datasourceAdminDialog.css'/>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/dojo/djConfig.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/cache/cache-service.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/themes/jquery.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/themes/themeUtils.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/_focus.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/_a11y.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/_dialog.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/xss.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/URLEncoder.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/SessionExpiryCheckStartingPoint.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/util/pentaho-csrf.js'></scr"+"ipt>");
document.write("<script language='javascript' type='text/javascript' src='" + CONTEXT_PATH + "content/common-ui/resources/web/repo/pentaho-ajax.js'></scr"+"ipt>");