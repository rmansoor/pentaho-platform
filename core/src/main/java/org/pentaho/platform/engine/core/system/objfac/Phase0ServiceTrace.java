/*!
 *
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU General Public License, version 2 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/gpl-2.0.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU General Public License for more details.
 *
 *
 * Copyright (c) 2002-2026 Hitachi Vantara. All rights reserved.
 *
 */

package org.pentaho.platform.engine.core.system.objfac;

import com.google.common.annotations.VisibleForTesting;
import org.osgi.framework.Bundle;
import org.osgi.framework.ServiceReference;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * De-OSGi migration &mdash; Phase 0 instrumentation.
 *
 * <p>Records every <em>successful</em> resolution that flows through {@link OSGIObjectFactory} so that the exact set of
 * services the legacy platform pulls out of the OSGi registry can be frozen as a migration contract. Disabled by
 * default; enable with the system property below.</p>
 *
 * <pre>-Dpentaho.osgi.phase0.trace=true</pre>
 *
 * <p>When enabled, each distinct {@code (requested interface, serving bundle)} pair is logged once at {@code INFO} on
 * the dedicated logger {@code org.pentaho.platform.osgi.phase0}, in a stable, greppable format:</p>
 *
 * <pre>OSGI-RESOLVE iface=&lt;fqcn&gt; bundle=&lt;symbolic-name&gt;/&lt;version&gt; bundleId=&lt;n&gt;</pre>
 *
 * <p>This class holds no behaviour the server depends on. It is a temporary diagnostic and should be removed with the
 * rest of the OSGi bridge in the final phase of the Karaf Exit Plan.</p>
 */
final class Phase0ServiceTrace {

  static final String TRACE_PROPERTY = "pentaho.osgi.phase0.trace";

  /** Read once at class-load. Restart the server to toggle. Package-private + non-final only so tests can flip it. */
  @VisibleForTesting
  static boolean enabled = Boolean.getBoolean( TRACE_PROPERTY );

  private static final Logger LOG = LoggerFactory.getLogger( "org.pentaho.platform.osgi.phase0" );

  /** De-dup key set so a hot path logs each distinct resolution exactly once. */
  private static final Set<String> SEEN = ConcurrentHashMap.newKeySet();

  private Phase0ServiceTrace() {
  }

  /**
   * Record a successful resolution. No-op unless {@link #ENABLED}. Never throws &mdash; instrumentation must not be able
   * to break resolution.
   *
   * @param requested the interface/class the caller asked {@code PentahoSystem} for
   * @param ref       the OSGi service reference that satisfied it (may be null)
   */
  static void record( Class<?> requested, ServiceReference<?> ref ) {
    if ( !enabled || requested == null ) {
      return;
    }
    try {
      String iface = requested.getName();

      // The bridge's own wrapper interface is not a migration target - skip the internal recursion's self-report.
      if ( "org.pentaho.platform.api.engine.IPentahoObjectReference".equals( iface ) ) {
        return;
      }

      String bundleName = "unknown";
      String bundleVersion = "";
      long bundleId = -1L;

      if ( ref != null ) {
        Bundle bundle = ref.getBundle();
        if ( bundle != null ) {
          bundleName = bundle.getSymbolicName();
          bundleVersion = String.valueOf( bundle.getVersion() );
          bundleId = bundle.getBundleId();
        }
      }

      String key = iface + "|" + bundleName + "|" + bundleVersion;
      if ( SEEN.add( key ) ) {
        LOG.info( "OSGI-RESOLVE iface={} bundle={}/{} bundleId={}", iface, bundleName, bundleVersion, bundleId );
      }
    } catch ( Throwable t ) {
      // Diagnostics must never interfere with the resolution path.
      LOG.debug( "phase0 trace failed", t );
    }
  }

  /** Dump the full de-duplicated contract, sorted, at {@code INFO}. Callable from a scriptlet or a shutdown hook. */
  static void dumpContract() {
    if ( !enabled ) {
      return;
    }
    LOG.info( "OSGI-RESOLVE-CONTRACT begin ({} distinct resolutions)", SEEN.size() );
    SEEN.stream().sorted().forEach( k -> LOG.info( "OSGI-RESOLVE-CONTRACT {}", k ) );
    LOG.info( "OSGI-RESOLVE-CONTRACT end" );
  }

  @VisibleForTesting
  static void resetForTest() {
    SEEN.clear();
  }

  @VisibleForTesting
  static int seenCount() {
    return SEEN.size();
  }
}
