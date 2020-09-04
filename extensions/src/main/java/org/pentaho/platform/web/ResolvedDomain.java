/*!
 *
 * This program is free software; you can redistribute it and/or modify it under the
 * terms of the GNU Lesser General Public License, version 2.1 as published by the Free Software
 * Foundation.
 *
 * You should have received a copy of the GNU Lesser General Public License along with this
 * program; if not, you can obtain a copy at http://www.gnu.org/licenses/old-licenses/lgpl-2.1.html
 * or from the Free Software Foundation, Inc.,
 * 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.
 *
 * This program is distributed in the hope that it will be useful, but WITHOUT ANY WARRANTY;
 * without even the implied warranty of MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.
 * See the GNU Lesser General Public License for more details.
 *
 *
 * Copyright (c) 2002-2020 Hitachi Vantara. All rights reserved.
 *
 */
package org.pentaho.platform.web;

import java.net.IDN;
import java.net.URI;
import java.net.URISyntaxException;

public class ResolvedDomain {
  private String scheme;
  private String host;
  private int port = -1;

  public ResolvedDomain( String domain ) throws Exception {
    URI uri = null;
    try {
      uri = new URI( domain );
    } catch ( URISyntaxException e ) {
      throw new Exception( "Unable to resolve domain: " + e.getMessage() );
    }

    this.scheme = uri.getScheme();
    this.host = uri.getHost();
    this.port = uri.getPort();
    if ( this.scheme == null ) {
      throw new Exception( "Scheme is missing" );
    }
    this.scheme = this.scheme.toLowerCase();
    if ( this.host == null ) {
      throw new Exception( "Missing host" );
    }
    this.host = IDN.toASCII( this.host, 3 );

    this.host = this.host.toLowerCase();
  }

  public String getScheme() {
    return this.scheme;
  }

  public String getHost() {
    return this.host;
  }

  public int getPort() {
    return this.port;
  }

  public String getDomainWithoutScheme() {
    String s = this.host;
    if ( this.port != -1 ) {
      s = s + ":" + this.port;
    }
    return s;
  }
}
