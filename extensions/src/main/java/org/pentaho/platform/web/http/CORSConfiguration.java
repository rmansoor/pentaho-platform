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
package org.pentaho.platform.web.http;

import org.apache.commons.logging.Log;
import org.apache.commons.logging.LogFactory;
import org.pentaho.platform.web.ResolvedDomain;

import javax.servlet.http.HttpServletRequest;
import javax.servlet.http.HttpServletResponse;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;

public class CORSConfiguration {

  public static final String REQUEST_HEADERS = "Access-Control-Request-Headers";
  public static final String REQUEST_METHOD = "Access-Control-Request-Method";
  public static final String ORIGIN_HEADER = "origin";
  public static final String ALLOW_HEADER = "Allow";
  public static final String CORS_EXPOSE_HEADERS_HEADER = "Access-Control-Expose-Headers";
  public static final String CORS_ALLOW_METHODS = "Access-Control-Allow-Methods";
  public static final String CORS_ALLOW_HEADERS = "Access-Control-Allow-Headers";
  public static final String CORS_MAX_AGE = "Access-Control-Max-Age";
  public static final String CORS_ALLOW_ORIGIN_HEADER = "Access-Control-Allow-Origin";
  public static final String CORS_ALLOW_CREDENTIALS_HEADER = "Access-Control-Allow-Credentials";

  private static CORSConfiguration instance = new CORSConfiguration();
  private static Log logger = LogFactory.getLog( CORSConfiguration.class );
  private boolean allowAnyDomain;
  private List<String> allowedDomains;
  private boolean allowSubdomains;
  private List<String> allowedMethods;
  private List<String> exposedHeaders;
  private List<String> allowedHeaders;
  private boolean supportsCredentials;
  private boolean allowAnyHeader;
  private int maxAge;

  private CORSConfiguration() {
  }

  public static CORSConfiguration getInstance() {
    return instance;
  }

  public static void setInstance( CORSConfiguration instance ) {
    CORSConfiguration.instance = instance;
  }

  public boolean isAllowAnyDomain() {
    return allowAnyDomain;
  }

  public void setAllowAnyDomain( boolean allowAnyDomain ) {
    this.allowAnyDomain = allowAnyDomain;
  }

  public List<String> getAllowedDomains() {
    return allowedDomains;
  }

  public void setAllowedDomains( List<String> allowedDomains ) {
    this.allowedDomains = allowedDomains;
  }

  public boolean isAllowSubdomains() {
    return allowSubdomains;
  }

  public void setAllowSubdomains( boolean allowSubdomains ) {
    this.allowSubdomains = allowSubdomains;
  }

  public List<String> getAllowedMethods() {
    return allowedMethods;
  }

  public void setAllowedMethods( List<String> allowedMethods ) {
    this.allowedMethods = allowedMethods;
  }

  public List<String> getExposedHeaders() {
    return exposedHeaders;
  }

  public void setExposedHeaders( List<String> exposedHeaders ) {
    this.exposedHeaders = exposedHeaders;
  }

  public List<String> getAllowedHeaders() {
    return allowedHeaders;
  }

  public void setAllowedHeaders( List<String> allowedHeaders ) {
    this.allowedHeaders = allowedHeaders;
  }

  public boolean isSupportsCredentials() {
    return supportsCredentials;
  }

  public void setSupportsCredentials( boolean supportsCredentials ) {
    this.supportsCredentials = supportsCredentials;
  }

  public boolean isAllowAnyHeader() {
    return allowAnyHeader;
  }

  public void setAllowAnyHeader( boolean allowAnyHeader ) {
    this.allowAnyHeader = allowAnyHeader;
  }

  public int getMaxAge() {
    return maxAge;
  }

  public void setMaxAge( int maxAge ) {
    this.maxAge = maxAge;
  }

  public void applyCORSHeaders( HttpServletRequest request, HttpServletResponse response ) {
    logDebug( "Starting to apply CORS headers to the incoming request [ " + request.getRequestURL() + " ]"  );
    String method = request.getMethod().toUpperCase();
    if ( method.equals( "OPTIONS" ) ) {
      logDebug( "HTTP Request method was evaluated as OPTIONS. Processing the request to apply preflight scenario " );
      processPreflightScenario( request, response );
    } else {
      logDebug( "HTTP Request method was evaluated as [ " +  method + " ] Processing the request to apply actual scenario " );
      processActualScenario( request, response );
    }
    logHeaderValue( response );
    logDebug( "Finished applying CORS headers to the incoming request [ " + request.getRequestURL() + " ]"  );
  }

  private boolean isCorsRequestMethodAllowed( String method ) {
    List<String> allowedMethods = CORSConfiguration.getInstance().getAllowedMethods();
    if ( allowedMethods != null && allowedMethods.contains( method ) ) {
      return true;
    } else {
      return false;
    }
  }

  private List<String> parseHeader( String headerValue ) {
    if ( headerValue == null ) {
      return new ArrayList<>( 0 );
    }
    String cleansedHeaderValue = headerValue.trim();
    if ( cleansedHeaderValue.isEmpty() ) {
      return new ArrayList<>( 0 );
    }
    return Arrays.asList( cleansedHeaderValue.split( "\\s*,\\s*|\\s+" ) );
  }

  private boolean isCorsRequestHeaderAllowed( String requestHeader ) {
    List<String> allowedHeaders = CORSConfiguration.getInstance().getAllowedHeaders();
    if ( allowedHeaders != null && allowedHeaders.contains( requestHeader ) ) {
      return true;
    } else {
      return false;
    }
  }

  private boolean isAllowedSubdomain( String domain ) {
    try {
      List<String> allowedDomains = CORSConfiguration.getInstance().getAllowedDomains();
      ResolvedDomain resolvedDomain = new ResolvedDomain( domain );
      String scheme = resolvedDomain.getScheme();
      String domainWithoutScheme = resolvedDomain.getDomainWithoutScheme();
      for ( String allowedDomain : allowedDomains ) {
        ResolvedDomain resolvedAllowedDomain = new ResolvedDomain( allowedDomain );
        if ( ( domainWithoutScheme.endsWith( "." + resolvedAllowedDomain.getDomainWithoutScheme() ) ) && ( scheme
            .equalsIgnoreCase( resolvedAllowedDomain.getScheme() ) ) ) {
          return true;
        }
      }
    } catch ( Exception e ) {
      return false;
    }
    return false;
  }

  private boolean isRequestOriginAllowed( String domain ) {
    // If the origin coming in is null or empty, we will return true
    if ( domain == null || domain.isEmpty() ) {
      return true;
    }
    if ( domain.equalsIgnoreCase( "null" ) ) {
      return false;
    }
    if ( CORSConfiguration.getInstance().isAllowAnyDomain() ) {
      return true;
    }
    if ( CORSConfiguration.getInstance().isAllowSubdomains() ) {
      return isAllowedSubdomain( domain );
    }
    List<String> allowedDomains = CORSConfiguration.getInstance().getAllowedDomains();
    return allowedDomains != null && allowedDomains.contains( domain );
  }

  private void processPreflightScenario( HttpServletRequest request, HttpServletResponse response ) {
    logDebug( "Starting the preflight scenario" );
    final String origin = request.getHeader( ORIGIN_HEADER );
    logDebug( "Request origin header has been identified as [ " + origin + " ]" );
    if ( isRequestOriginAllowed( origin ) ) {
      String method = request.getHeader( REQUEST_METHOD );
      method = method.toUpperCase();
      logDebug( "Request method header has been identified as [ " + method + " ]" );
      if ( isCorsRequestMethodAllowed( method ) ) {
        logDebug( "Request method is in the list of allowed method. So passing the processing for further checks" );
        String requestHeadersString = request.getHeader( REQUEST_HEADERS );
        processRequesMethod( method, request, response, true );
        processRequestHeaders( requestHeadersString, response );
        if ( CORSConfiguration.getInstance().isSupportsCredentials() ) {
          logDebug( "Configuration property supportsCredentials is set to true. Setting the request header "
              + CORS_ALLOW_CREDENTIALS_HEADER + "with value true " );
          response.setHeader( CORS_ALLOW_CREDENTIALS_HEADER, "true" );
          processOriginRequestHeader( origin, request, response );
        } else if ( CORSConfiguration.getInstance().isAllowAnyDomain() ) {
          processAllowAnyDomain( response );
          response.setHeader( "Vary", "Origin" );
        }
        int maxAge = CORSConfiguration.getInstance().getMaxAge();
        if ( maxAge > 0 ) {
          logDebug( "Setting the request header" + CORS_MAX_AGE + "with value [ " + maxAge + " ]" );
          response.setHeader( CORS_MAX_AGE, Integer.toString( maxAge ) );
        } else {
          logDebug( "Configuration property maxAge is not set" );
        }
      } else {
        logDebug( "Requested method [ " + method + " ] is not in the list of allowed method" );
      }
    } else {
      logDebug( "Requested Origin [ " + origin + " ] is not in the list of allowed origin" );
    }
  }

  private void processActualScenario( HttpServletRequest request, HttpServletResponse response ) {
    final String origin = request.getHeader( ORIGIN_HEADER );
    if ( isRequestOriginAllowed( origin ) ) {
      String method = request.getMethod().toUpperCase();
      if ( isCorsRequestMethodAllowed( method ) ) {
        logDebug( "Request method is in the list of allowed method. So passing the processing for further checks" );
        processRequesMethod( method, request, response, false );
        if ( CORSConfiguration.getInstance().isSupportsCredentials() ) {
          logDebug( "Configuration property supportsCredentials is set to true. Setting the request header "
              + CORS_ALLOW_CREDENTIALS_HEADER + "with value true " );
          response.setHeader( CORS_ALLOW_CREDENTIALS_HEADER, "true" );
          processOriginRequestHeader( origin, request, response );
        } else if ( CORSConfiguration.getInstance().isAllowAnyDomain() ) {
          processAllowAnyDomain( response );
        } else {
          processOriginRequestHeader( origin, request, response );
        }
        List<String> exposedHeaders = CORSConfiguration.getInstance().getExposedHeaders();
        if ( exposedHeaders != null && exposedHeaders.size() > 0 ) {
          response.setHeader( CORS_EXPOSE_HEADERS_HEADER, String.join( ",", exposedHeaders ) );
          logDebug( "Setting the request header" + CORS_EXPOSE_HEADERS_HEADER + "with value [ " + String
              .join( ",", exposedHeaders ) + " ]" );
        } else {
          logDebug( "Configuration property exposedHeaders is not set" );
        }
      } else {
        logDebug( "Requested method [ " + method + " is not in the list of allowed method" );
      }
    } else {
      logDebug( "Requested Origin [ " + origin + " is not in the list of allowed origin" );
    }
  }

  private void processAllowAnyDomain( HttpServletResponse response ) {
    response.setHeader( CORS_ALLOW_ORIGIN_HEADER, "*" );
    logDebug(
        "Configuration property allowAnyDomain is set to true. Setting the request header " + CORS_ALLOW_ORIGIN_HEADER
            + "with value * " );
  }

  private void processOriginRequestHeader( String origin, HttpServletRequest request, HttpServletResponse response ) {
    if ( isAllowAnyDomain() ) {
      logDebug( "Setting the request header" + CORS_ALLOW_ORIGIN_HEADER + "with value [ * ]" );
      response.setHeader( CORS_ALLOW_ORIGIN_HEADER, "*" );
    } else {
      if ( origin != null ) {
        logDebug( "Setting the request header" + CORS_ALLOW_ORIGIN_HEADER + "with value [ " + origin + " ]" );
        response.setHeader( CORS_ALLOW_ORIGIN_HEADER, origin );
      } else {
        logDebug( "Request header Origin value is null.  Setting the request header" + CORS_ALLOW_ORIGIN_HEADER
            + "with value [ " + String.join( ",", CORSConfiguration.getInstance().getAllowedDomains() ) + "  ]" );
        response.setHeader( CORS_ALLOW_ORIGIN_HEADER,
            String.join( ",", CORSConfiguration.getInstance().getAllowedDomains() ) );
      }
    }
    response.setHeader( "Vary", "Origin" );
  }

  private void processRequesMethod( String method, HttpServletRequest request, HttpServletResponse response,
      boolean preflight ) {
    if ( !isCorsRequestMethodAllowed( method ) ) {
      logger.error( "Missing Access-Control-Request-Method header [ " + method + " ]" );
    } else {
      if ( !preflight ) {
        logDebug( "This is an actual request. Setting the [ " +  CORS_ALLOW_METHODS + " ] to be [ " + method + " ]" );
        response.setHeader( CORS_ALLOW_METHODS, method );
      } else {
        logDebug( "This is a preflight request. Setting the [ " +  CORS_ALLOW_METHODS + " ] to be [ "
            + String.join( ",", CORSConfiguration.getInstance().getAllowedMethods() ) + " ]" );
        response
            .setHeader( CORS_ALLOW_METHODS, String.join( ",", CORSConfiguration.getInstance().getAllowedMethods() ) );
      }
    }
  }

  private void processRequestHeaders( String requestHeadersString, HttpServletResponse response ) {
    if ( !CORSConfiguration.getInstance().isAllowAnyHeader() ) {
      if ( isHeaderInTheListOfSupportedHeaders( requestHeadersString ) ) {
        logDebug(
            "All the headers are in the list of allowed header. So setting the request header " + CORS_ALLOW_HEADERS
                + "with value [ " + String.join( ",", CORSConfiguration.getInstance().getAllowedHeaders() ) + " ]" );
        response
            .setHeader( CORS_ALLOW_HEADERS, String.join( ",", CORSConfiguration.getInstance().getAllowedHeaders() ) );
      }
    } else {
      logDebug( "Configuration property allowAnyHeader is true. Setting the request header" + CORS_ALLOW_HEADERS
          + "with value [ " + String.join( ",", CORSConfiguration.getInstance().getAllowedHeaders() ) + " ]" );
      response.setHeader( CORS_ALLOW_HEADERS, String.join( ",", CORSConfiguration.getInstance().getAllowedHeaders() ) );
    }
  }

  private boolean isHeaderInTheListOfSupportedHeaders( String requestHeadersString ) {
    List<String> allowedHeaders = CORSConfiguration.getInstance().getAllowedHeaders();
    List<String> requestHeaderValues = parseHeader( requestHeadersString );
    for ( String header : requestHeaderValues ) {
      if ( !allowedHeaders.contains( header ) ) {
        logger.error( header + " is not listed as part of the allowed headers" );
        return false;
      }
    }
    return true;
  }

  private void logDebug( String message ) {
    //logger.error( message );
    if ( logger.isDebugEnabled() ) {
      logger.debug( message );
    }
  }

  private void logHeaderValue( HttpServletResponse response ) {
    for ( String header: response.getHeaderNames() ) {
      logDebug( "[ " + header + " ==> " + response.getHeader( header ) + " ]" );
    }
  }
}
