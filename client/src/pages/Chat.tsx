"use client"

import { useState, useEffect } from "react"
import {
  SidebarInset,
  Sidebar,
  SidebarContent,
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
  SidebarFooter,
  useSidebar,
} from "@/components/blocks/sidebar"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { ScrollArea } from "@/components/ui/scroll-area"
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar"
import { CardDescription, CardTitle } from "@/components/ui/card"
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Menu,
  MessageCircle,
  Search,
  Send,
  Paperclip,
  File,
  Image,
  Settings,
  User2,
  ChevronUp,
  Plus,
  ListFilter,
} from "lucide-react"
import { useAuth } from "@/context/AuthContext"
import { useNavigate } from "react-router-dom"
import { authService } from "@/services/authService"
import { messageService, Message } from "@/services/messageService"
import { fileService } from "@/services/fileService"
import { getPrivateKey, storeEcdhKeyPairPersistent, getEcdhKeyPairPersistent, deleteEcdhKeyPairPersistent, storeSessionKeyPersistent, getSessionKeyPersistent, deleteSessionKeyPersistent } from "@/storage/keyStorage"
import { initiateKeyExchange, handleKeyExchangeResponse, sendKeyConfirmation, storeSessionKey, getSessionKey, deriveSessionKey, storeEcdhKeyPair, getEcdhKeyPair, clearEcdhKeyPair } from "@/crypto/keyExchange"
import { encryptMessage, decryptMessage } from "@/crypto/messageEncryption"
import { encryptFile, decryptFile } from "@/crypto/fileEncryption"
import { keyExchangeService } from "@/services/keyExchangeService"
import { MessageList } from "@/components/MessageList"
import { SidebarProvider } from "@/components/blocks/sidebar"

const Chat = () => {
  const { user, logout } = useAuth()
  const navigate = useNavigate()

  const handleLogout = () => {
    logout()
    navigate("/login")
  }

  return (
    <SidebarProvider>
      <ChatContent user={user} onLogout={handleLogout} />
    </SidebarProvider>
  )
}

const ChatContent = ({ user, onLogout }: { user: any; onLogout: () => void }) => {
  const { toggleSidebar } = useSidebar()
  const [contacts, setContacts] = useState<any[]>([])
  const [currentChat, setCurrentChat] = useState<{ name: string; id: string } | null>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [message, setMessage] = useState("")
  const [searchQuery, setSearchQuery] = useState("")
  const [loading, setLoading] = useState(false)

  // Load conversations/contacts on mount
  useEffect(() => {
    const loadConversations = async () => {
      try {
        // Get all user IDs that the current user has messaged with
        const userIds = await messageService.getAllConversations()
        
        if (userIds.length === 0) {
          setContacts([])
          return
        }
        
        // Fetch user details for each conversation partner
        const conversationPartners = await Promise.all(
          userIds.map(async (userId: string) => {
            try {
              const userData = await authService.getPublicKey(userId)
              return {
                _id: userId,
                username: userData.username || userId,
                publicKey: userData.publicKey
              }
            } catch (error) {
              console.error(`Failed to fetch user ${userId}:`, error)
              return null
            }
          })
        )
        
        // Filter out nulls and set contacts
        const validContacts = conversationPartners.filter(c => c !== null) as any[]
        setContacts(validContacts)
        
        // If there are contacts and no current chat selected, select the first one
        if (validContacts.length > 0 && !currentChat) {
          setCurrentChat({
            id: validContacts[0]._id,
            name: validContacts[0].username
          })
        }
      } catch (error) {
        console.error('Failed to load conversations:', error)
        // If loading conversations fails, contacts will be empty
        // User can still search for users to start new conversations
      }
    }
    
    if (user?.id) {
      loadConversations()
    }
  }, [user?.id])

  useEffect(() => {
    if (!currentChat) return

    const ensureSessionForChat = async () => {
      let existingKey = getSessionKey(currentChat.id)
      
      // If not in memory, don't establish a new one automatically
      // User can send a message to establish session if needed
      if (!existingKey) {
        console.log('[KEY EXCHANGE] Session key not in memory. Messages may not decrypt until session is established.')
        console.log('[KEY EXCHANGE] User can send a message to establish session, or old messages may be from previous sessions.')
        // Load messages anyway - some might decrypt if session key is in IndexedDB and user enters password
        await loadMessages()
        return
      }
      
      if (existingKey) {
        console.log('[KEY EXCHANGE] Session key exists, loading messages...')
        await loadMessages()
        return
      }
      try {
        // First, check if there's a response to an exchange we initiated
        try {
          const responsesCheck = await keyExchangeService.getResponses(currentChat.id)
          if (responsesCheck.responses && responsesCheck.responses.length > 0) {
            console.log('[KEY EXCHANGE] Found response to our exchange, attempting to complete...')
            const response = responsesCheck.responses[0]
            
            // Try to get ECDH key pair from memory first, then IndexedDB
            let storedKeyPair = getEcdhKeyPair(response.exchangeId)
            
            if (!storedKeyPair) {
              console.log('[KEY EXCHANGE] ECDH key pair not in memory, checking IndexedDB...')
              const password = prompt('Enter your password to retrieve ECDH key pair:')
              if (password) {
                storedKeyPair = await getEcdhKeyPairPersistent(response.exchangeId, password)
                if (storedKeyPair) {
                  console.log('[KEY EXCHANGE] Retrieved ECDH key pair from IndexedDB')
                  storeEcdhKeyPair(response.exchangeId, storedKeyPair)
                }
              }
            }
            
            if (storedKeyPair) {
              // We have the key pair, complete the exchange
              const recipient = await authService.getPublicKey(currentChat.id)
              const recipientPubKeyBuffer = Uint8Array.from(atob(recipient.publicKey), c => c.charCodeAt(0))
              const recipientPubKey = await crypto.subtle.importKey(
                'spki',
                recipientPubKeyBuffer,
                { name: 'RSA-PSS', hash: 'SHA-256' },
                false,
                ['verify']
              )
              
              const password = prompt('Enter your password to complete key exchange:')
              if (!password) return
              
              const privateKey = await getPrivateKey(user.id, password)
              if (!privateKey) return
              
              // Verify response signature
              const responseData = JSON.stringify({
                type: 'response',
                fromUserId: response.toUserId,
                toUserId: response.fromUserId,
                publicKey: response.responsePublicKey,
                timestamp: response.responseTimestamp,
              })
              const encoder = new TextEncoder()
              const responseBytes = encoder.encode(responseData)
              const responseSignatureBytes = Uint8Array.from(atob(response.responseSignature), c => c.charCodeAt(0))
              
              const isValid = await crypto.subtle.verify(
                { name: 'RSA-PSS', saltLength: 32 },
                recipientPubKey,
                responseSignatureBytes,
                responseBytes
              )
              
              if (!isValid) {
                console.error('[KEY EXCHANGE] Invalid response signature')
                return
              }
              
              // Derive session key
              const otherEcdhPublicKeyBuffer = Uint8Array.from(atob(response.responsePublicKey), c => c.charCodeAt(0))
              const otherEcdhPublicKeyCrypto = await crypto.subtle.importKey(
                'spki',
                otherEcdhPublicKeyBuffer,
                { name: 'ECDH', namedCurve: 'P-256' },
                false,
                []
              )
              
              const sharedSecret = await crypto.subtle.deriveBits(
                { name: 'ECDH', public: otherEcdhPublicKeyCrypto },
                storedKeyPair.privateKey,
                256
              )
              
              const sessionKey = await deriveSessionKey(
                sharedSecret,
                response.responsePublicKey,
                user.id,
                response.toUserId
              )
              
              storeSessionKey(currentChat.id, sessionKey)
              // Also store in IndexedDB for persistence
              try {
                const password = prompt('Enter your password to store session key:')
                if (password) {
                  await storeSessionKeyPersistent(currentChat.id, sessionKey, password)
                  console.log('[KEY EXCHANGE] Session key stored in IndexedDB')
                }
              } catch (error) {
                console.warn('[KEY EXCHANGE] Failed to store session key in IndexedDB:', error)
              }
              
              clearEcdhKeyPair(response.exchangeId)
              // Also delete from IndexedDB
              try {
                await deleteEcdhKeyPairPersistent(response.exchangeId)
              } catch (error) {
                console.warn('[KEY EXCHANGE] Failed to delete ECDH key pair from IndexedDB:', error)
              }
              
              const confirmation = await sendKeyConfirmation(sessionKey, currentChat.id, user.id)
              await keyExchangeService.confirm(response.exchangeId, confirmation.confirmationHash!)
              
              console.log('[KEY EXCHANGE] Session key established from response')
              await loadMessages()
              return
            } else {
              console.warn('[KEY EXCHANGE] ECDH key pair not found, cannot complete exchange')
            }
          }
        } catch (error) {
          console.log('[KEY EXCHANGE] No responses found or error:', error)
        }
        
        // No response found, establish new session
        let recipientPublicKey = contacts.find(c => c._id === currentChat.id)?.publicKey
        if (!recipientPublicKey) {
          console.log('[KEY EXCHANGE] Fetching recipient public key from server...')
          const recipient = await authService.getPublicKey(currentChat.id)
          recipientPublicKey = recipient.publicKey
        }

        if (!recipientPublicKey) {
          console.error('[KEY EXCHANGE] Unable to determine recipient public key')
          return
        }

        console.log('[KEY EXCHANGE] Establishing session before reading messages...')
        const sessionKey = await establishSession(currentChat.id, recipientPublicKey)
        if (sessionKey) {
          console.log('[KEY EXCHANGE] Session established, loading messages...')
          await loadMessages()
        } else {
          console.error('[KEY EXCHANGE] Failed to establish session key')
        }
      } catch (error) {
        console.error('[KEY EXCHANGE] Failed to ensure session key:', error)
      }
    }

    ensureSessionForChat()
    
    // Poll for new messages every 3 seconds
    const messagePollInterval = setInterval(() => {
      if (currentChat && getSessionKey(currentChat.id)) {
        loadMessages()
      }
    }, 3000)

    return () => {
      clearInterval(messagePollInterval)
    }
  }, [currentChat, contacts])

  const loadMessages = async () => {
    if (!currentChat) return
    
    const sessionKey = getSessionKey(currentChat.id)
    if (!sessionKey) {
      console.log('[MESSAGE] No session key, skipping message load')
      return
    }
    
    try {
      console.log('[MESSAGE] Loading messages for conversation with:', currentChat.id)
      const msgs = await messageService.getConversation(currentChat.id)
      console.log('[MESSAGE] Loaded', msgs.length, 'messages')
      
      // Only update if we got messages or if messages array changed
      setMessages(prev => {
        if (prev.length !== msgs.length) {
          return msgs
        }
        // Check if any message IDs changed
        const prevIds = new Set(prev.map(m => m._id))
        const newIds = new Set(msgs.map(m => m._id))
        if (prevIds.size !== newIds.size || ![...prevIds].every(id => newIds.has(id))) {
          return msgs
        }
        return prev
      })
    } catch (error: any) {
      if (error.response?.status === 404) {
        console.log('[MESSAGE] No messages found (404) - this is normal for new conversations')
        setMessages([])
      } else {
        console.error('[MESSAGE] Failed to load messages:', error)
      }
    }
  }

  const handleSearch = async (query: string) => {
    if (query.length < 2) {
      setContacts([])
      return
    }
    try {
      const users = await authService.searchUsers(query)
      setContacts(users)
    } catch (error) {
      console.error('Search failed:', error)
    }
  }

  const establishSession = async (recipientId: string, recipientPublicKey: string) => {
    try {
      let password = prompt('Enter your password to access private key:')
      if (!password) {
        console.log('[KEY EXCHANGE] User cancelled password prompt')
        return null
      }

      console.log('[KEY EXCHANGE] Retrieving private key for user:', user.id)
      let privateKey = await getPrivateKey(user.id, password)
      
      // If password is wrong, give 2 more attempts
      let attempts = 0
      while (!privateKey && attempts < 2) {
        attempts++
        password = prompt(`Incorrect password. Try again (${attempts}/2):`)
        if (!password) {
          console.log('[KEY EXCHANGE] User cancelled password prompt')
          return null
        }
        privateKey = await getPrivateKey(user.id, password)
      }
      
      if (!privateKey) {
        console.error('[KEY EXCHANGE] Failed to retrieve private key after 3 attempts')
        alert('Failed to retrieve private key. Password incorrect.\n\nIMPORTANT: Private keys are stored locally during registration.\nIf you logged in from a different browser/device, you need to use the original browser where you registered, or register a new account.')
        return null
      }

      console.log('[KEY EXCHANGE] Private key retrieved successfully')

      console.log('[KEY EXCHANGE] Getting own public key from server')
      const ownUserData = await authService.getPublicKey(user.id)
      const ownPublicKeyBuffer = Uint8Array.from(atob(ownUserData.publicKey), c => c.charCodeAt(0))
      const ownPublicKey = await crypto.subtle.importKey(
        'spki',
        ownPublicKeyBuffer,
        {
          name: 'RSA-PSS',
          hash: 'SHA-256',
        },
        false,
        ['verify']
      )

      console.log('[KEY EXCHANGE] Importing recipient public key')
      const recipientPubKeyBuffer = Uint8Array.from(atob(recipientPublicKey), c => c.charCodeAt(0))
      const recipientPubKey = await crypto.subtle.importKey(
        'spki',
        recipientPubKeyBuffer,
        {
          name: 'RSA-PSS',
          hash: 'SHA-256',
        },
        false,
        ['verify']
      )

      console.log('[KEY EXCHANGE] Starting key exchange process')
      
      // Step 1: Check if there's a pending exchange from the recipient (they initiated)
      console.log('[KEY EXCHANGE] Checking for pending exchanges from recipient...')
      let pendingExchanges
      try {
        const pendingResponse = await keyExchangeService.getPending(recipientId)
        pendingExchanges = pendingResponse.exchanges || []
        console.log('[KEY EXCHANGE] Found', pendingExchanges.length, 'pending exchanges from recipient')
      } catch (error: any) {
        console.error('[KEY EXCHANGE] Error checking pending exchanges:', error.message)
        pendingExchanges = []
      }

      // Step 2: Check if there's a response to an exchange we initiated
      console.log('[KEY EXCHANGE] Checking for responses to our initiated exchanges...')
      let responses
      try {
        const responsesResponse = await keyExchangeService.getResponses(recipientId)
        responses = responsesResponse?.responses || []
        console.log('[KEY EXCHANGE] Found', responses.length, 'responses to our exchanges')
      } catch (error: any) {
        // 404 is expected if no responses exist yet
        if (error.response?.status === 404) {
          console.log('[KEY EXCHANGE] No responses found (404) - this is normal')
        } else {
          console.error('[KEY EXCHANGE] Error checking responses:', error.message)
        }
        responses = []
      }

      let exchangeId: string
      let otherEcdhPublicKey: string
      let myEcdhKeyPair: CryptoKeyPair
      let myEcdhPublicKeyBase64: string

      // Priority: Respond to pending exchanges first (if recipient initiated)
      if (pendingExchanges.length > 0) {
        // Respond to existing exchange (we are the recipient)
        console.log('[KEY EXCHANGE] Responding to existing exchange from recipient')
        const exchange = pendingExchanges[0]
        exchangeId = exchange.exchangeId || `${exchange.fromUserId}-${exchange.toUserId}-${exchange.createdAt}`
        otherEcdhPublicKey = exchange.publicKey
        
        console.log('[KEY EXCHANGE] Exchange details:', {
          exchangeId,
          fromUserId: exchange.fromUserId,
          toUserId: exchange.toUserId,
          hasPublicKey: !!otherEcdhPublicKey
        })

        // Generate our ECDH key pair for the response
        myEcdhKeyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDH',
            namedCurve: 'P-256',
          },
          true,
          ['deriveKey', 'deriveBits']
        )

        const myEcdhPublicKeyBuffer = await crypto.subtle.exportKey('spki', myEcdhKeyPair.publicKey)
        myEcdhPublicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(myEcdhPublicKeyBuffer)))

        const responseTimestamp = Date.now()
        const responseData = JSON.stringify({
          type: 'response',
          fromUserId: user.id,
          toUserId: recipientId,
          publicKey: myEcdhPublicKeyBase64,
          timestamp: responseTimestamp,
        })

        const encoder = new TextEncoder()
        const responseBytes = encoder.encode(responseData)
        const responseSignature = await crypto.subtle.sign(
          {
            name: 'RSA-PSS',
            saltLength: 32,
          },
          privateKey,
          responseBytes
        )

        console.log('[KEY EXCHANGE] Sending response to existing exchange')
        const responseResult = await keyExchangeService.respond(
          exchangeId,
          myEcdhPublicKeyBase64,
          btoa(String.fromCharCode(...new Uint8Array(responseSignature))),
          responseTimestamp
        )

        // Verify the original signature
        const originalSignatureBytes = Uint8Array.from(atob(responseResult.originalSignature), c => c.charCodeAt(0))
        const originalData = JSON.stringify({
          type: 'initiate',
          fromUserId: exchange.fromUserId,
          toUserId: exchange.toUserId,
          publicKey: otherEcdhPublicKey,
          timestamp: exchange.timestamp,
        })
        const originalDataBytes = encoder.encode(originalData)
        
        const isValidOriginal = await crypto.subtle.verify(
          {
            name: 'RSA-PSS',
            saltLength: 32,
          },
          recipientPubKey,
          originalSignatureBytes,
          originalDataBytes
        )

        if (!isValidOriginal) {
          throw new Error('Invalid signature in original exchange')
        }

        // Derive session key using recipient's public key and our private key
        const otherEcdhPublicKeyBuffer = Uint8Array.from(atob(otherEcdhPublicKey), c => c.charCodeAt(0))
        const otherEcdhPublicKeyCrypto = await crypto.subtle.importKey(
          'spki',
          otherEcdhPublicKeyBuffer,
          {
            name: 'ECDH',
            namedCurve: 'P-256',
          },
          false,
          []
        )

        const sharedSecret = await crypto.subtle.deriveBits(
          {
            name: 'ECDH',
            public: otherEcdhPublicKeyCrypto,
          },
          myEcdhKeyPair.privateKey,
          256
        )

        const sessionKey = await deriveSessionKey(
          sharedSecret,
          otherEcdhPublicKey, // This is the base64 string
          user.id, // Current user (responder)
          exchange.fromUserId // Initiator
        )
        
        console.log('[KEY EXCHANGE] Session key derived as responder:', {
          myUserId: user.id,
          otherUserId: exchange.fromUserId,
          storedWith: recipientId,
          sessionKeyExists: !!sessionKey
        })

        storeSessionKey(recipientId, sessionKey)
        // Also store in IndexedDB for persistence
        try {
          await storeSessionKeyPersistent(recipientId, sessionKey, password)
          console.log('[KEY EXCHANGE] Session key stored in IndexedDB')
        } catch (error) {
          console.warn('[KEY EXCHANGE] Failed to store session key in IndexedDB:', error)
        }

        const confirmation = await sendKeyConfirmation(sessionKey, recipientId, user.id)
        await keyExchangeService.confirm(exchangeId, confirmation.confirmationHash!)

        console.log('[KEY EXCHANGE] ✅ Key exchange completed as recipient - session key stored')
        return sessionKey
      } 
      
      // If we have a response to our initiated exchange, complete it
      if (responses.length > 0) {
        console.log('[KEY EXCHANGE] Found response to our exchange, completing key exchange...')
        const response = responses[0]
        
        // Get our stored ECDH key pair (try memory first, then IndexedDB)
        let storedKeyPair = getEcdhKeyPair(response.exchangeId)
        
        if (!storedKeyPair) {
          console.log('[KEY EXCHANGE] ECDH key pair not found in memory, checking IndexedDB...')
          // Try to get from IndexedDB (persistent storage)
          // Use the same password that was used for private key (we already have it from establishSession)
          // But we need to prompt again since we don't store it
          const password = prompt('Enter your password to retrieve ECDH key pair:')
          if (password) {
            storedKeyPair = await getEcdhKeyPairPersistent(response.exchangeId, password)
            if (storedKeyPair) {
              console.log('[KEY EXCHANGE] ✅ Retrieved ECDH key pair from IndexedDB')
              // Also store in memory for faster access
              storeEcdhKeyPair(response.exchangeId, storedKeyPair)
            } else {
              console.log('[KEY EXCHANGE] ECDH key pair not found in IndexedDB either')
            }
          } else {
            console.log('[KEY EXCHANGE] User cancelled password prompt for ECDH key pair')
          }
        }
        
        if (!storedKeyPair) {
          console.warn('[KEY EXCHANGE] ⚠️ ECDH key pair not found in memory or IndexedDB for exchange:', response.exchangeId)
          console.warn('[KEY EXCHANGE] This exchange may have expired or the key pair was never stored')
          console.warn('[KEY EXCHANGE] The response exists but we cannot complete without the original ECDH private key')
          console.warn('[KEY EXCHANGE] Will initiate new exchange instead')
          // Don't return here - let it fall through to initiate new exchange
        } else {
          console.log('[KEY EXCHANGE] Found stored ECDH key pair, completing exchange...')
          
          // Derive session key using our stored ECDH private key and their public key
          const otherEcdhPublicKeyBuffer = Uint8Array.from(atob(response.responsePublicKey), c => c.charCodeAt(0))
          const otherEcdhPublicKeyCrypto = await crypto.subtle.importKey(
            'spki',
            otherEcdhPublicKeyBuffer,
            {
              name: 'ECDH',
              namedCurve: 'P-256',
            },
            false,
            []
          )

          const sharedSecret = await crypto.subtle.deriveBits(
            {
              name: 'ECDH',
              public: otherEcdhPublicKeyCrypto,
            },
            storedKeyPair.privateKey,
            256
          )

          const sessionKey = await deriveSessionKey(
            sharedSecret,
            response.responsePublicKey,
            user.id, // Current user (initiator completing)
            recipientId // Recipient
          )
          
          console.log('[KEY EXCHANGE] Session key derived as initiator (completing):', {
            myUserId: user.id,
            otherUserId: recipientId,
            storedWith: recipientId,
            sessionKeyExists: !!sessionKey
          })

          storeSessionKey(recipientId, sessionKey)
          // Also store in IndexedDB for persistence
          try {
            await storeSessionKeyPersistent(recipientId, sessionKey, password)
            console.log('[KEY EXCHANGE] Session key stored in IndexedDB')
          } catch (error) {
            console.warn('[KEY EXCHANGE] Failed to store session key in IndexedDB:', error)
          }
          
          clearEcdhKeyPair(response.exchangeId)
          // Also delete from IndexedDB
          try {
            await deleteEcdhKeyPairPersistent(response.exchangeId)
          } catch (error) {
            console.warn('[KEY EXCHANGE] Failed to delete ECDH key pair from IndexedDB:', error)
          }

          const confirmation = await sendKeyConfirmation(sessionKey, recipientId, user.id)
          await keyExchangeService.confirm(response.exchangeId, confirmation.confirmationHash!)

          console.log('[KEY EXCHANGE] ✅ Key exchange completed as initiator - session key stored')
          return sessionKey
        }
      }
      
      // No pending exchanges and no responses - initiate new exchange
      {
        // Initiate new exchange (we are the initiator)
        console.log('[KEY EXCHANGE] No pending exchanges found, initiating new exchange')
        
        myEcdhKeyPair = await crypto.subtle.generateKey(
          {
            name: 'ECDH',
            namedCurve: 'P-256',
          },
          true,
          ['deriveKey', 'deriveBits']
        )

        const myEcdhPublicKeyBuffer = await crypto.subtle.exportKey('spki', myEcdhKeyPair.publicKey)
        myEcdhPublicKeyBase64 = btoa(String.fromCharCode(...new Uint8Array(myEcdhPublicKeyBuffer)))

        const initiateTimestamp = Date.now()
        const initiateData = JSON.stringify({
          type: 'initiate',
          fromUserId: user.id,
          toUserId: recipientId,
          publicKey: myEcdhPublicKeyBase64,
          timestamp: initiateTimestamp,
        })

        const encoder = new TextEncoder()
        const initiateBytes = encoder.encode(initiateData)
        const initiateSignature = await crypto.subtle.sign(
          {
            name: 'RSA-PSS',
            saltLength: 32,
          },
          privateKey,
          initiateBytes
        )

        console.log('[KEY EXCHANGE] Sending initiate request to server')
        const exchangeResponse = await keyExchangeService.initiate(
          recipientId,
          myEcdhPublicKeyBase64,
          btoa(String.fromCharCode(...new Uint8Array(initiateSignature))),
          initiateTimestamp
        )
        exchangeId = exchangeResponse.exchangeId
        console.log('[KEY EXCHANGE] Initiate response received:', exchangeResponse)
        
        // Store the ECDH key pair in memory AND IndexedDB (persistent)
        storeEcdhKeyPair(exchangeId, myEcdhKeyPair)
        
        // Also store in IndexedDB for persistence across page refreshes
        try {
          await storeEcdhKeyPairPersistent(exchangeId, myEcdhKeyPair, password)
          console.log('[KEY EXCHANGE] ECDH key pair stored in IndexedDB for persistence')
        } catch (error) {
          console.warn('[KEY EXCHANGE] Failed to store ECDH key pair in IndexedDB:', error)
        }
        
        // Check if recipient has already responded (they might have opened chat first)
        console.log('[KEY EXCHANGE] Checking if recipient has already responded...')
        try {
          const responsesCheck = await keyExchangeService.getResponses(recipientId)
          if (responsesCheck.responses && responsesCheck.responses.length > 0) {
            const response = responsesCheck.responses.find((r: any) => r.exchangeId === exchangeId)
            if (response) {
              console.log('[KEY EXCHANGE] Found response to our exchange, completing...')
              
              // Get our stored ECDH key pair (try memory first, then IndexedDB)
              let storedKeyPair = getEcdhKeyPair(exchangeId)
              
              if (!storedKeyPair) {
                console.log('[KEY EXCHANGE] ECDH key pair not in memory, checking IndexedDB...')
                const password = prompt('Enter your password to retrieve ECDH key pair:')
                if (password) {
                  storedKeyPair = await getEcdhKeyPairPersistent(exchangeId, password)
                  if (storedKeyPair) {
                    console.log('[KEY EXCHANGE] Retrieved ECDH key pair from IndexedDB')
                    storeEcdhKeyPair(exchangeId, storedKeyPair)
                  }
                }
              }
              
              if (!storedKeyPair) {
                console.error('[KEY EXCHANGE] ECDH key pair not found in memory or IndexedDB')
                return null
              }
              
              // Derive session key using our stored ECDH private key and their public key
              const otherEcdhPublicKeyBuffer = Uint8Array.from(atob(response.responsePublicKey), c => c.charCodeAt(0))
              const otherEcdhPublicKeyCrypto = await crypto.subtle.importKey(
                'spki',
                otherEcdhPublicKeyBuffer,
                {
                  name: 'ECDH',
                  namedCurve: 'P-256',
                },
                false,
                []
              )

              const sharedSecret = await crypto.subtle.deriveBits(
                {
                  name: 'ECDH',
                  public: otherEcdhPublicKeyCrypto,
                },
                storedKeyPair.privateKey,
                256
              )

              const sessionKey = await deriveSessionKey(
                sharedSecret,
                response.responsePublicKey,
                user.id, // Current user (initiator)
                recipientId // Recipient
              )
              
              console.log('[KEY EXCHANGE] Session key derived as initiator (from stored ECDH):', {
                myUserId: user.id,
                otherUserId: recipientId,
                storedWith: recipientId,
                sessionKeyExists: !!sessionKey
              })

              storeSessionKey(recipientId, sessionKey)
              // Also store in IndexedDB for persistence
              try {
                await storeSessionKeyPersistent(recipientId, sessionKey, password)
                console.log('[KEY EXCHANGE] Session key stored in IndexedDB')
              } catch (error) {
                console.warn('[KEY EXCHANGE] Failed to store session key in IndexedDB:', error)
              }
              
              clearEcdhKeyPair(exchangeId) // Clean up memory
              // Also delete from IndexedDB
              try {
                await deleteEcdhKeyPairPersistent(exchangeId)
              } catch (error) {
                console.warn('[KEY EXCHANGE] Failed to delete ECDH key pair from IndexedDB:', error)
              }

              const confirmation = await sendKeyConfirmation(sessionKey, recipientId, user.id)
              await keyExchangeService.confirm(exchangeId, confirmation.confirmationHash!)

              console.log('[KEY EXCHANGE] Key exchange completed as initiator')
              return sessionKey
            }
          }
        } catch (error) {
          console.log('[KEY EXCHANGE] Error checking for responses:', error)
        }
        
        // If recipient hasn't responded yet, we need to wait
        console.warn('[KEY EXCHANGE] Exchange initiated but waiting for recipient response. They need to open the chat.')
        return null
      }
    } catch (error: any) {
      console.error('[KEY EXCHANGE] Key exchange failed:', error)
      console.error('[KEY EXCHANGE] Error details:', {
        name: error.name,
        message: error.message,
        stack: error.stack,
      })
      return null
    }
  }

  const handleSendMessage = async () => {
    console.log('[SEND] handleSendMessage called', { message: message.trim(), currentChat, loading })
    if (!message.trim() || !currentChat) {
      console.log('[SEND] Blocked: empty message or no chat selected')
      return
    }

    setLoading(true)
    try {
      let sessionKey = getSessionKey(currentChat.id)
      
      // If not in memory, try IndexedDB first (don't establish new key if old one exists)
      if (!sessionKey) {
        console.log('[MESSAGE] Session key not in memory, checking IndexedDB...')
        const password = prompt('Enter your password to retrieve session key (or cancel to establish new session):')
        if (password) {
          sessionKey = await getSessionKeyPersistent(currentChat.id, password)
          if (sessionKey) {
            console.log('[MESSAGE] Retrieved session key from IndexedDB')
            storeSessionKey(currentChat.id, sessionKey)
          } else {
            console.log('[MESSAGE] No session key in IndexedDB, will establish new one')
          }
        } else {
          console.log('[MESSAGE] User cancelled password prompt, will establish new session')
        }
      }
      
      // If still no session key, establish new one
      if (!sessionKey) {
        const recipient = contacts.find(c => c._id === currentChat.id)
        if (!recipient) {
          alert('Recipient not found')
          return
        }
        console.log('[MESSAGE] Establishing new session key (this will replace any old session key)')
        sessionKey = await establishSession(currentChat.id, recipient.publicKey)
        if (!sessionKey) {
          alert('Failed to establish secure session')
          return
        }
      }

      const encrypted = await encryptMessage(message, sessionKey, `${user.id}-${currentChat.id}`)
      await messageService.send(currentChat.id, encrypted)
      setMessage("")
      await loadMessages()
    } catch (error) {
      console.error('Failed to send message:', error)
      alert('Failed to send message')
    } finally {
      setLoading(false)
    }
  }

  const handleFileUpload = async (file: File) => {
    if (!currentChat) return

    setLoading(true)
    try {
      let sessionKey = getSessionKey(currentChat.id)
      if (!sessionKey) {
        const recipient = contacts.find(c => c._id === currentChat.id)
        if (!recipient) {
          alert('Recipient not found')
          return
        }
        sessionKey = await establishSession(currentChat.id, recipient.publicKey)
        if (!sessionKey) {
          alert('Failed to establish secure session')
          return
        }
      }

      const encryptedFile = await encryptFile(file, sessionKey)
      await fileService.upload(currentChat.id, encryptedFile)
      alert('File uploaded successfully')
    } catch (error) {
      console.error('Failed to upload file:', error)
      alert('Failed to upload file')
    } finally {
      setLoading(false)
    }
  }

  const menuItems = [
    { title: "Messages", url: "#", icon: MessageCircle },
  ]

  return (
    <>
      <Sidebar variant="floating" collapsible="icon">
        <SidebarContent>
          <SidebarGroup>
            <SidebarGroupLabel>Navigate</SidebarGroupLabel>
            <SidebarGroupContent>
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton onClick={toggleSidebar}>
                    <Menu />
                    <span className="sr-only">Toggle Sidebar</span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
                {menuItems.map((item) => (
                  <SidebarMenuItem key={item.title}>
                    <SidebarMenuButton asChild>
                      <a href={item.url}>
                        <item.icon />
                        <span>{item.title}</span>
                      </a>
                    </SidebarMenuButton>
                  </SidebarMenuItem>
                ))}
              </SidebarMenu>
            </SidebarGroupContent>
          </SidebarGroup>
        </SidebarContent>
        <SidebarFooter>
          <SidebarMenu>
            <SidebarMenuItem>
              <SidebarMenuButton>
                <Settings /> Settings
              </SidebarMenuButton>
            </SidebarMenuItem>
            <SidebarMenuItem>
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <SidebarMenuButton>
                    <User2 /> {user?.username || "User"}
                    <ChevronUp className="ml-auto" />
                  </SidebarMenuButton>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  side="top"
                  className="w-[--radix-popper-anchor-width]"
                >
                  <DropdownMenuItem>
                    <span>Account</span>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={onLogout}>
                    <span>Sign out</span>
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </SidebarMenuItem>
          </SidebarMenu>
        </SidebarFooter>
      </Sidebar>

      <SidebarInset>
        <ResizablePanelGroup direction="horizontal" className="h-screen">
          <ResizablePanel defaultSize={25} minSize={20} className="flex-grow">
            <div className="flex flex-col h-screen border ml-1">
              <div className="h-10 px-2 py-4 flex items-center">
                <p className="ml-1">Chats</p>
                <div className="flex justify-end w-full">
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <Plus />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent>
                      <DropdownMenuItem>
                        <User2 /> New Contact
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon">
                        <ListFilter />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent className="w-56">
                      <DropdownMenuLabel>Filter Chats By</DropdownMenuLabel>
                      <DropdownMenuSeparator />
                      <DropdownMenuGroup>
                        <DropdownMenuItem>Unread</DropdownMenuItem>
                        <DropdownMenuItem>Favorites</DropdownMenuItem>
                      </DropdownMenuGroup>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>

              <div className="relative px-2 py-4">
                <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5" />
                <Input
                  placeholder="Search or start new chat"
                  className="pl-10"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value)
                    handleSearch(e.target.value)
                  }}
                />
              </div>

              <ScrollArea className="flex-grow">
                {contacts.length > 0 ? (
                  contacts.map((contact) => (
                    <button
                      key={contact._id}
                      onClick={() => setCurrentChat({ name: contact.username, id: contact._id })}
                      className="px-4 w-full py-2 hover:bg-secondary cursor-pointer text-left"
                    >
                      <div className="flex flex-row gap-2">
                        <Avatar className="size-12">
                          <AvatarFallback>{contact.username[0]}</AvatarFallback>
                        </Avatar>
                        <div className="space-y-2">
                          <CardTitle>{contact.username}</CardTitle>
                        </div>
                      </div>
                    </button>
                  ))
                ) : (
                  <div className="px-4 py-2 text-sm text-muted-foreground">
                    {searchQuery ? 'No users found' : 'Search for users to start chatting'}
                  </div>
                )}
              </ScrollArea>
            </div>
          </ResizablePanel>

          <ResizableHandle />

          <ResizablePanel defaultSize={75} minSize={40}>
            <div className="flex flex-col justify-between h-screen ml-1 pb-2">
              <div className="h-16 border-b flex items-center px-3">
                {currentChat ? (
                  <>
                    <Avatar className="size-12">
                      <AvatarFallback>{currentChat.name[0]}</AvatarFallback>
                    </Avatar>
                    <div className="space-y-1 ml-2">
                      <CardTitle>{currentChat.name}</CardTitle>
                      <CardDescription>Encrypted</CardDescription>
                    </div>
                  </>
                ) : (
                  <div className="flex-1 flex items-center justify-center h-full">
                    <p className="text-muted-foreground">Select a conversation to start chatting</p>
                  </div>
                )}
              </div>

              <ScrollArea className="flex-1 p-4 mb-2">
                {currentChat && messages.length > 0 ? (
                  <MessageList
                    messages={messages}
                    currentUserId={user.id}
                    conversationId={currentChat.id}
                  />
                ) : currentChat ? (
                  <div className="text-center text-muted-foreground">
                    No messages yet. Start the conversation!
                  </div>
                ) : null}
              </ScrollArea>

              <div className="flex h-12 px-3 py-2 border-t items-center gap-2">
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="ghost" size="icon">
                      <Paperclip />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent>
                    <DropdownMenuItem>
                      <label className="flex items-center cursor-pointer w-full">
                        <Image className="mr-2" />
                        <span>Photos & Videos</span>
                        <input
                          type="file"
                          accept="image/*,video/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileUpload(file)
                          }}
                        />
                      </label>
                    </DropdownMenuItem>
                    <DropdownMenuItem>
                      <label className="flex items-center cursor-pointer w-full">
                        <File className="mr-2" />
                        <span>Document</span>
                        <input
                          type="file"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0]
                            if (file) handleFileUpload(file)
                          }}
                        />
                      </label>
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Input
                  className="flex-grow border-0 h-9"
                  placeholder="Type a message"
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  onKeyPress={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault()
                      handleSendMessage()
                    }
                  }}
                />
                <Button variant="ghost" size="icon" disabled={!message.trim() || loading} onClick={handleSendMessage}>
                  <Send />
                </Button>
              </div>
            </div>
          </ResizablePanel>
        </ResizablePanelGroup>
      </SidebarInset>
    </>
  )
}

export default Chat
