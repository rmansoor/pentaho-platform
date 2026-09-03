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

package org.pentaho.platform.security.web.spring;

import org.pentaho.platform.security.web.model.matcher.OrRequestMatcher;
import org.springframework.beans.factory.config.BeanDefinition;
import org.springframework.beans.factory.support.BeanDefinitionBuilder;
import org.springframework.beans.factory.support.ManagedList;
import org.springframework.beans.factory.xml.AbstractSingleBeanDefinitionParser;
import org.springframework.beans.factory.xml.ParserContext;
import org.w3c.dom.Element;
import org.w3c.dom.Node;
import org.w3c.dom.NodeList;

/**
 * Parses {@code <hsw:or-request-matcher>} with any mix of nested {@code hsw:*-request-matcher} children
 * and foreign elements (e.g. {@code <pen-gpc:system-gwt-rpc-request-matcher>}), delegating each child
 * back to the parser context, into an {@link OrRequestMatcher} bean.
 */
public class OrRequestMatcherBeanDefinitionParser extends AbstractSingleBeanDefinitionParser {

  @Override
  protected Class<?> getBeanClass( Element element ) {
    return OrRequestMatcher.class;
  }

  @Override
  protected boolean shouldGenerateIdAsFallback() {
    return true;
  }

  @Override
  protected void doParse( Element element, ParserContext parserContext, BeanDefinitionBuilder builder ) {
    ManagedList<Object> children = new ManagedList<>();

    NodeList nodes = element.getChildNodes();
    for ( int i = 0; i < nodes.getLength(); i++ ) {
      Node node = nodes.item( i );
      if ( node.getNodeType() != Node.ELEMENT_NODE ) {
        continue;
      }

      Element child = (Element) node;
      Object parsed = parserContext.getDelegate().parseCustomElement( child, builder.getRawBeanDefinition() );
      if ( parsed instanceof BeanDefinition || parsed != null ) {
        children.add( parsed );
      }
    }

    builder.addConstructorArgValue( children );
  }
}
