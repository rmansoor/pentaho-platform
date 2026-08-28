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

import java.nio.file.Files;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.HashSet;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

/**
 * De-OSGi migration &mdash; Phase 0/1 diagnostics for the OSGi&nbsp;&rarr;&nbsp;{@code PentahoSystem} object bridge
 * ({@link OSGIObjectFactory}). Two independent, opt-in behaviours; both are inert unless their system property is set.
 *
 * <h3>1. Resolution trace &mdash; {@code -Dpentaho.osgi.phase0.trace=true}</h3>
 * Records every <em>successful</em> resolution that flows through the bridge so the exact set of services the legacy
 * platform pulls out of OSGi can be frozen as a migration contract. Each distinct
 * {@code (requested interface, serving bundle)} pair is logged once at {@code INFO} on the dedicated logger
 * {@code org.pentaho.platform.osgi.phase0}:
 * <pre>OSGI-RESOLVE iface=&lt;fqcn&gt; bundle=&lt;symbolic-name&gt;/&lt;version&gt; bundleId=&lt;n&gt;</pre>
 *
 * <h3>2. Bridge blocklist &mdash; {@code -Dpentaho.osgi.phase0.blocklist=<list>}</h3>
 * Makes {@link OSGIObjectFactory} behave as if OSGi never provided the listed interfaces &mdash; every lookup returns
 * {@code null} / empty / {@code false} <em>before</em> the registry is consulted. Lets a server run as though a
 * capability had already been de-OSGi'd, so the classic {@code AggregateObjectFactory} fall-through (Spring beans in
 * {@code pentaho-solutions/system/*.spring.xml}) can be validated against the full regression checklist.
 * <p>The value is a comma / whitespace / newline separated list of fully-qualified interface names, or
 * {@code @<path>} to read the list from a file. Blocked lookups are logged once as {@code OSGI-BLOCKED iface=<fqcn>}.
 *
 * <p>This class holds no behaviour the server depends on. It is a temporary diagnostic and must be removed with the
 * rest of the OSGi bridge in the final phase of the Karaf Exit Plan.</p>
 */
final class Phase0ServiceTrace {

  static final String TRACE_PROPERTY = "pentaho.osgi.phase0.trace";
  static final String BLOCKLIST_PROPERTY = "pentaho.osgi.phase0.blocklist";

  // Field order matters: LOG and SEEN are used by the initializers below, so they must come first.
  private static final Logger LOG = LoggerFactory.getLogger( "org.pentaho.platform.osgi.phase0" );

  /** De-dup key set so a hot path logs each distinct resolution / block exactly once. */
  private static final Set<String> SEEN = ConcurrentHashMap.newKeySet();

  /** Read once at class-load. Restart the server to toggle. Package-private + non-final only so tests can flip it. */
  @VisibleForTesting
  static boolean enabled = Boolean.getBoolean( TRACE_PROPERTY );

  /** Interface FQCNs the bridge must pretend it cannot resolve. Empty = normal behaviour. */
  @VisibleForTesting
  static Set<String> blocklist = parseBlocklist( System.getProperty( BLOCKLIST_PROPERTY ) );

  private Phase0ServiceTrace() {
  }

  @VisibleForTesting
  static Set<String> parseBlocklist( String raw ) {
    if ( raw == null || raw.trim().isEmpty() ) {
      return Collections.emptySet();
    }
    try {
      String text = raw.trim();
      if ( text.startsWith( "@" ) ) {
        text = new String( Files.readAllBytes( Paths.get( text.substring( 1 ) ) ),
          java.nio.charset.StandardCharsets.UTF_8 );
      }
      // Drop whole comment lines first, THEN split what remains on commas / whitespace.
      Set<String> out = new HashSet<>();
      for ( String line : text.split( "\\R" ) ) {
        String trimmed = line.trim();
        if ( trimmed.isEmpty() || trimmed.startsWith( "#" ) ) {
          continue;
        }
        Arrays.stream( trimmed.split( "[,\\s]+" ) )
          .map( String::trim )
          .filter( s -> !s.isEmpty() && s.indexOf( '.' ) > 0 )
          .forEach( out::add );
      }
      if ( !out.isEmpty() && LOG != null ) {
        LOG.warn( "OSGI-BLOCKLIST active - the bridge will not resolve {} interface(s): {}", out.size(), out );
      }
      return out;
    } catch ( Throwable t ) {
      if ( LOG != null ) {
        LOG.error( "Could not parse " + BLOCKLIST_PROPERTY + "='" + raw + "'; blocklist disabled", t );
      }
      return Collections.emptySet();
    }
  }

  /**
   * @return true if the bridge should behave as though this interface is not registered in OSGi at all. Never throws.
   */
  static boolean isBlocked( Class<?> requested ) {
    return requested != null && isBlocked( requested.getName() );
  }

  static boolean isBlocked( String interfaceName ) {
    if ( blocklist.isEmpty() || interfaceName == null ) {
      return false;
    }
    boolean blocked = blocklist.contains( interfaceName );
    if ( blocked && SEEN.add( "BLOCKED|" + interfaceName ) ) {
      LOG.info( "OSGI-BLOCKED iface={}", interfaceName );
    }
    return blocked;
  }

  /**
   * Record a successful resolution. No-op unless {@link #enabled}. Never throws &mdash; instrumentation must not be
   * able to break resolution.
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
    LOG.info( "OSGI-RESOLVE-CONTRACT begin ({} distinct entries)", SEEN.size() );
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
