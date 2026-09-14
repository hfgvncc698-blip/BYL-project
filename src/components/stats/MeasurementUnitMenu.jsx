import React from 'react';
import { Button, Menu, MenuButton, MenuList, MenuOptionGroup, MenuItemOption, Portal } from '@chakra-ui/react';
import { ChevronDownIcon } from '@chakra-ui/icons';

export default function MeasurementUnitMenu({label,value,options,onChange}) {
  return <Menu placement="bottom-end">
    <MenuButton as={Button} type="button" variant="outline" size="sm" h="32px" minW="96px" flexShrink={0}
      px={3} fontSize="sm" fontWeight="600" borderRadius="full" rightIcon={<ChevronDownIcon boxSize={4}/>}
      aria-label={`${label}: ${options.find(option=>option.value===value)?.label || value}`}>
      {options.find(option=>option.value===value)?.label || value}
    </MenuButton>
    <Portal><MenuList minW="112px" borderRadius="16px" p={1} zIndex={1500}>
      <MenuOptionGroup type="radio" value={value} onChange={onChange}>
        {options.map(option=><MenuItemOption key={option.value} value={option.value} borderRadius="12px" fontSize="sm" py={3}>{option.label}</MenuItemOption>)}
      </MenuOptionGroup>
    </MenuList></Portal>
  </Menu>;
}
