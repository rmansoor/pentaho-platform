/*! ******************************************************************************
 *
 * Pentaho
 *
 * Copyright (C) 2026 by Pentaho Canada Inc. : http://www.pentaho.com
 *
 * Use of this software is governed by the Business Source License included
 * in the LICENSE.TXT file.
 *
 * Change Date: 2030-06-15
 ******************************************************************************/

package org.pentaho.platform.security.web.model.cors;

import org.pentaho.platform.security.web.model.matcher.RequestMatcher;

import java.util.Set;

/**
 * One contributed CORS configuration, scoped to the requests its {@link #getRequestMatcher() matcher}
 * selects. Configurations form an inheritance tree via {@link #getParentName()}; the single root is
 * named {@value #ROOT_NAME}. An {@link #isAbstract() abstract} configuration only supplies defaults to
 * its children and never applies on its own.
 * <p>
 * Clean-room replacement for {@code com.hitachivantara.security.web.model.cors.CorsRequestSetConfiguration}.
 */
public interface CorsRequestSetConfiguration {

  String ROOT_NAME = "root";

  String getName();

  String getParentName();

  boolean isAbstract();

  RequestMatcher getRequestMatcher();

  boolean isEnabled();

  /** Enabled, taking the parent chain into account. */
  default boolean isEnabledEffective() {
    return isEnabled();
  }

  Set<String> getAllowedOrigins();

  Set<String> getAllowedMethods();

  Set<String> getAllowedHeaders();

  Boolean getAllowCredentials();

  Long getMaxAge();

  Set<String> getExposedHeaders();
}
