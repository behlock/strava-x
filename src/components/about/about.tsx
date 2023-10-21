import React from 'react'
import Image from 'next/image'
import { ArrowDown, ArrowRight } from 'lucide-react'

import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible'

// @ts-ignore
const About = ({ isOpen, onOpenChange }) => {
  return (
    <Collapsible className="flex flex-grow flex-col" open={isOpen} onOpenChange={onOpenChange}>
      <CollapsibleTrigger>
        <div className="flex">
          <span>[about]</span>
          {isOpen ? <ArrowDown className="ml-2" /> : <ArrowRight className="ml-2" />}
        </div>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="mt-2 flex flex-col ">
          <div className="flex max-w-screen-md flex-col space-y-2">
            <span>
              I love discovering cities through activities. I also love data. So I decided to combine the two and gamify
              my runs. This makes it more fun to explore new areas and get out the door. This is an example of what my
              map looks like in London.
            </span>
            <Image src="/my-map-trimmed.png" width={1200} height={600} alt="my-map" />
          </div>
        </div>
      </CollapsibleContent>
    </Collapsible>
  )
}

export default About
