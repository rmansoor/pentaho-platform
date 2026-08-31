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
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.io.File;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashSet;
import java.util.Set;

/**
 * De-OSGi migration &mdash; the <em>permanent</em> counterpart of the {@link Phase0ServiceTrace} blocklist diagnostic.
 *
 * <p>Interfaces named here are resolved by the classic {@code AggregateObjectFactory} path only: {@link OSGIObjectFactory}
 * (the OSGi&nbsp;&rarr;&nbsp;{@code PentahoSystem} forward bridge) declines them, so {@code PentahoSystem.get} /
 * {@code getAll} fall straight through to the in-JVM {@code RuntimeObjectFactory} registry &mdash; the classic
 * {@code <pen:publish>} beans in {@code pentaho-solutions/system/*.spring.xml}. The reverse bridge still publishes them
 * into OSGi, so a genuine container-side consumer is unaffected.</p>
 *
 * <p>As each phase of the Karaf Exit Plan de-OSGi's a capability, its interfaces are added to the bundled resource
 * {@code de-osgi-classic-interfaces.txt} (same package). Two optional, rebuild-free extension points:</p>
 * <ul>
 *   <li>{@code -Dpentaho.osgi.classic.additions=<list|@path>} &mdash; comma / whitespace / newline separated FQCNs, or
 *       {@code @<file>};</li>
 *   <li>{@code <PentahoSystemPath>/osgi/classic-interfaces.txt} &mdash; same format, read once at class-load.</li>
 * </ul>
 *
 * <p>Read once at class-load; restart to change. This whole class is deleted together with the OSGi bridge in the final
 * phase of the migration.</p>
 */
public final class ClassicResolutionList {

  static final String ADDITIONS_PROPERTY = "pentaho.osgi.classic.additions";
  static final String BUNDLED_RESOURCE = "de-osgi-classic-interfaces.txt";
  static final String EXTERNAL_FILE = "osgi" + File.separator + "classic-interfaces.txt";

  private static final Logger LOG = LoggerFactory.getLogger( "org.pentaho.platform.osgi.phase0" );

  /** Interface FQCNs the forward bridge must never resolve. Package-private + non-final only so tests can flip it. */
  @VisibleForTesting
  static Set<String> interfaces = load();

  private ClassicResolutionList() {
  }

  @VisibleForTesting
  static Set<String> load() {
    Set<String> out = new LinkedHashSet<>();
    addFrom( out, readBundledResource() );
    addFrom( out, System.getProperty( ADDITIONS_PROPERTY ) );
    addFrom( out, readExternalFile() );
    if ( !out.isEmpty() && LOG != null ) {
      LOG.info( "OSGI-CLASSIC active - {} interface(s) resolved by the classic platform only: {}", out.size(), out );
    }
    return Collections.unmodifiableSet( out );
  }

  private static String readBundledResource() {
    try ( InputStream in = ClassicResolutionList.class.getResourceAsStream( BUNDLED_RESOURCE ) ) {
      if ( in == null ) {
        return null;
      }
      return new String( readAll( in ), StandardCharsets.UTF_8 );
    } catch ( Exception e ) {
      if ( LOG != null ) {
        LOG.error( "Could not read bundled " + BUNDLED_RESOURCE + "; de-OSGi classic list may be incomplete", e );
      }
      return null;
    }
  }

  private static String readExternalFile() {
    String systemPath = System.getProperty( "PentahoSystemPath" );
    if ( systemPath == null || systemPath.trim().isEmpty() ) {
      return null;
    }
    Path file = Paths.get( systemPath, EXTERNAL_FILE );
    if ( !Files.isReadable( file ) ) {
      return null;
    }
    try {
      return new String( Files.readAllBytes( file ), StandardCharsets.UTF_8 );
    } catch ( Exception e ) {
      if ( LOG != null ) {
        LOG.error( "Could not read " + file + "; ignoring", e );
      }
      return null;
    }
  }

  /**
   * Parse a raw block ({@code @<path>}, or comma / whitespace / newline separated FQCNs with {@code #} comments) and add
   * every entry to {@code target}. Never throws.
   */
  @VisibleForTesting
  static void addFrom( Set<String> target, String raw ) {
    if ( raw == null || raw.trim().isEmpty() ) {
      return;
    }
    try {
      String text = raw.trim();
      if ( text.startsWith( "@" ) ) {
        text = new String( Files.readAllBytes( Paths.get( text.substring( 1 ) ) ), StandardCharsets.UTF_8 );
      }
      for ( String line : text.split( "\\R" ) ) {
        String trimmed = line.trim();
        if ( trimmed.isEmpty() || trimmed.startsWith( "#" ) ) {
          continue;
        }
        Arrays.stream( trimmed.split( "[,\\s]+" ) )
          .map( String::trim )
          .filter( s -> !s.isEmpty() && s.indexOf( '.' ) > 0 )
          .forEach( target::add );
      }
    } catch ( Throwable t ) {
      if ( LOG != null ) {
        LOG.error( "Could not parse de-OSGi classic list fragment '" + raw + "'; ignoring", t );
      }
    }
  }

  private static byte[] readAll( InputStream in ) throws java.io.IOException {
    java.io.ByteArrayOutputStream buf = new java.io.ByteArrayOutputStream();
    byte[] chunk = new byte[ 4096 ];
    int n;
    while ( ( n = in.read( chunk ) ) != -1 ) {
      buf.write( chunk, 0, n );
    }
    return buf.toByteArray();
  }

  /**
   * @return true if the forward OSGi bridge must behave as though this interface is not registered in OSGi, so the
   * classic object factory resolves it. Never throws.
   */
  public static boolean resolvesClassically( Class<?> requested ) {
    return requested != null && resolvesClassically( requested.getName() );
  }

  public static boolean resolvesClassically( String interfaceName ) {
    return interfaceName != null && !interfaces.isEmpty() && interfaces.contains( interfaceName );
  }
}
